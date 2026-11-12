import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { JSX } from "hono/jsx/jsx-runtime";
import { METHODS } from "./content/methods";
import { RACE_ME_UP } from "./content/race-me-up";
import type { Locale } from "./i18n";
import { CreditsPage } from "./pages/credits";
import { FaqPage, FirstVisitPage } from "./pages/info";
import { MethodPage, MethodsIndexPage } from "./pages/method";
import { ProgrammesIndexPage, RaceMeUpPage } from "./pages/programmes";
import { CREDITS_PATH } from "./sections/credits-path";
import { type Theme, themeFrom } from "./theme";

interface PageContext {
	locale: Locale;
	theme: Theme;
	origin: string;
}

/** Methods, programmes, the first visit and the FAQ, under one locale's prefix. */
export function registerContentPages(app: Hono, locale: Locale, prefix: string): void {
	const page =
		(render: (p: PageContext) => JSX.Element) =>
		(c: Context): Response | Promise<Response> =>
			c.html(
				render({
					locale,
					theme: themeFrom(getCookie(c, "theme")),
					origin: new URL(c.req.url).origin,
				}),
			);
	app.get(
		`${prefix}/metode`,
		page((p) => <MethodsIndexPage {...p} />),
	);
	for (const method of METHODS) {
		app.get(
			`${prefix}${method.path}`,
			page((p) => <MethodPage {...p} method={method} />),
		);
	}
	app.get(
		`${prefix}/programe`,
		page((p) => <ProgrammesIndexPage {...p} />),
	);
	app.get(
		`${prefix}${RACE_ME_UP.path}`,
		page((p) => <RaceMeUpPage {...p} />),
	);
	app.get(
		`${prefix}/prima-vizita`,
		page((p) => <FirstVisitPage {...p} />),
	);
	app.get(
		`${prefix}/intrebari-frecvente`,
		page((p) => <FaqPage {...p} />),
	);
	app.get(
		`${prefix}${CREDITS_PATH}`,
		page((p) => <CreditsPage {...p} />),
	);
}
