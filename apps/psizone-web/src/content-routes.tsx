import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { JSX } from "hono/jsx/jsx-runtime";
import { HUBS } from "./content/hubs";
import { METHODS } from "./content/methods";
import { RACE_ME_UP } from "./content/race-me-up";
import { RICH_HUBS } from "./content/rich";
import type { Locale } from "./i18n";
import { CreditsPage } from "./pages/credits";
import { HubPage } from "./pages/hub";
import { FaqPage, FirstVisitPage } from "./pages/info";
import { MethodPage, MethodsIndexPage } from "./pages/method";
import { ProgrammesIndexPage, RaceMeUpPage } from "./pages/programmes";
import { RichHubPage } from "./pages/rich-hub";
import { CREDITS_PATH } from "./sections/credits-path";
import { type Theme, themeFrom } from "./theme";

interface PageContext {
	locale: Locale;
	theme: Theme;
	origin: string;
}

/** Hubs, methods, programmes, the first visit and the FAQ, under one locale's prefix. */
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
	for (const hub of HUBS) {
		const rich = RICH_HUBS[hub.id];
		app.get(
			`${prefix}${hub.path}`,
			page((p) =>
				rich === undefined ? (
					<HubPage {...p} hub={hub} />
				) : (
					<RichHubPage {...p} hub={hub} page={rich} />
				),
			),
		);
	}
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
