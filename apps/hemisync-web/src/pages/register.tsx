import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Locale } from "../i18n";
import {
	PAGE_IDS,
	PAGES,
	type PageId,
	PROGRAMME_SLUGS,
	WORKSHOP_IDS,
	workshopHref,
} from "../routes";
import { programmeHref } from "../sections/programmes";
import { themeFrom } from "../theme";
import { AboutPage } from "./about";
import { ClubPage } from "./club";
import { ContactPage } from "./contact";
import {
	ArchivePage,
	GlossaryPage,
	HistoryPage,
	MeditationPage,
	StartPage,
	WorkshopPage,
} from "./content-pages";
import { ExercisesPage } from "./exercises";
import { FaqPage } from "./faq";
import { FocusPage } from "./focus";
import { LegalPage } from "./legal";
import { ProgrammePage } from "./programme";
import { ProgrammesPage } from "./programmes";
import type { PageProps } from "./shell";
import { TechnologyPage } from "./technology";

const RENDER: Readonly<Record<PageId, (props: PageProps) => JSX.Element>> = {
	programmes: ProgrammesPage,
	exercises: ExercisesPage,
	technology: TechnologyPage,
	focus: FocusPage,
	club: ClubPage,
	faq: FaqPage,
	about: AboutPage,
	contact: ContactPage,
	terms: (p) => LegalPage({ ...p, kind: "terms" }),
	privacy: (p) => LegalPage({ ...p, kind: "privacy" }),
	cookies: (p) => LegalPage({ ...p, kind: "cookies" }),
	trademarks: (p) => LegalPage({ ...p, kind: "trademarks" }),
	history: HistoryPage,
	glossary: GlossaryPage,
	start: StartPage,
	meditation: MeditationPage,
	archive: ArchivePage,
};

const LOCALES: ReadonlyArray<Locale> = ["ro", "en"];

/**
 * Mounts every page of the route table, each programme page and each workshop type, in both locales. Programme slugs
 * come from an explicit list, so an unknown slug still answers 404.
 */
export function registerPages(app: Hono): void {
	for (const locale of LOCALES) {
		const props = (cookie: string | undefined, url: string): PageProps => ({
			locale,
			theme: themeFrom(cookie),
			origin: new URL(url).origin,
		});
		for (const id of PAGE_IDS) {
			const render = RENDER[id];
			app.get(PAGES[id][locale], (c) => c.html(render(props(getCookie(c, "theme"), c.req.url))));
		}
		for (const id of WORKSHOP_IDS) {
			app.get(workshopHref(locale, id), (c) =>
				c.html(WorkshopPage({ ...props(getCookie(c, "theme"), c.req.url), id })),
			);
		}
		for (const slug of PROGRAMME_SLUGS) {
			app.get(programmeHref(locale, slug), (c) =>
				c.html(ProgrammePage({ ...props(getCookie(c, "theme"), c.req.url), slug })),
			);
		}
	}
}
