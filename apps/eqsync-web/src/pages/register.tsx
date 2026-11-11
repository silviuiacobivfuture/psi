import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Locale } from "../i18n";
import { ALIASES, PAGE_IDS, PAGES, type PageId } from "../routes";
import { themeFrom } from "../theme";
import { AboutPage } from "./about";
import { ContactPage } from "./contact";
import { FaqPage } from "./faq";
import { LegalPage } from "./legal";
import { MethodPage } from "./method";
import { ProtocolsPage } from "./protocols";
import { SafetyPage } from "./safety";
import type { PageProps } from "./shell";
import { SignupPage } from "./signup";

const RENDER: Readonly<Record<PageId, (props: PageProps) => JSX.Element>> = {
	method: MethodPage,
	protocols: ProtocolsPage,
	faq: FaqPage,
	about: AboutPage,
	safety: SafetyPage,
	contact: ContactPage,
	signup: SignupPage,
	terms: (p) => LegalPage({ ...p, kind: "terms" }),
	privacy: (p) => LegalPage({ ...p, kind: "privacy" }),
	withdrawal: (p) => LegalPage({ ...p, kind: "withdrawal" }),
};

const LOCALES: ReadonlyArray<Locale> = ["ro", "en"];

/** Mounts every page of the route table in both locales, plus the 301s from older English links. */
export function registerPages(app: Hono): void {
	for (const locale of LOCALES) {
		for (const id of PAGE_IDS) {
			const render = RENDER[id];
			app.get(PAGES[id][locale], (c) =>
				c.html(
					render({
						locale,
						theme: themeFrom(getCookie(c, "theme")),
						origin: new URL(c.req.url).origin,
					}),
				),
			);
		}
	}
	for (const [from, id] of ALIASES) {
		app.get(from, (c) => c.redirect(PAGES[id].en, 301));
	}
}
