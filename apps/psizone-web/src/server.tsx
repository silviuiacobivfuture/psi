import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { BookingDone, BookingForm, BookingRequest, errorsFor } from "./booking";
import { HUBS } from "./content/hubs";
import { AskBody, streamAnswer } from "./guide";
import { at, type Locale } from "./i18n";
import { ContactPage } from "./pages/contact";
import { HomePage } from "./pages/home";
import { HubPage } from "./pages/hub";
import { PreparingPage, TeamPage } from "./pages/simple";
import { m } from "./paraglide/messages.js";
import { themeFrom } from "./theme";

const DATASTAR = readFileSync(fileURLToPath(import.meta.resolve("@psi/ui/datastar.js")), "utf8");
const PORT = Number.parseInt(process.env.PORT ?? "4310", 10);

export const app = new Hono();

app.get("/healthz", (c) => c.text("ok"));
app.get("/assets/datastar.js", (c) =>
	c.body(DATASTAR, 200, {
		"content-type": "text/javascript; charset=utf-8",
		"cache-control": "public, max-age=86400",
	}),
);
app.use("/assets/*", serveStatic({ root: "./public" }));
app.get("/favicon.svg", serveStatic({ path: "./public/favicon.svg" }));

for (const [locale, prefix] of [
	["ro", ""],
	["en", "/en"],
] as const satisfies ReadonlyArray<readonly [Locale, string]>) {
	app.get(prefix === "" ? "/" : prefix, (c) => {
		const origin = new URL(c.req.url).origin;
		return c.html(
			<HomePage locale={locale} theme={themeFrom(getCookie(c, "theme"))} origin={origin} />,
		);
	});
	for (const hub of HUBS) {
		app.get(`${prefix}${hub.path}`, (c) => {
			const origin = new URL(c.req.url).origin;
			return c.html(
				<HubPage
					hub={hub}
					locale={locale}
					theme={themeFrom(getCookie(c, "theme"))}
					origin={origin}
				/>,
			);
		});
	}
	app.get(`${prefix}/echipa`, (c) =>
		c.html(
			<TeamPage
				locale={locale}
				theme={themeFrom(getCookie(c, "theme"))}
				origin={new URL(c.req.url).origin}
				path="/echipa"
			/>,
		),
	);
	for (const [path, title] of [
		["/confidentialitate", m.privacy_title({}, at(locale))],
		["/politica-editoriala", m.editorial_title({}, at(locale))],
	] as const) {
		app.get(`${prefix}${path}`, (c) =>
			c.html(
				<PreparingPage
					locale={locale}
					theme={themeFrom(getCookie(c, "theme"))}
					origin={new URL(c.req.url).origin}
					path={path}
					title={title}
				/>,
			),
		);
	}
	app.get(`${prefix}/contact`, (c) => {
		const origin = new URL(c.req.url).origin;
		return c.html(
			<ContactPage locale={locale} theme={themeFrom(getCookie(c, "theme"))} origin={origin} />,
		);
	});
	app.post(`${prefix}/programare`, async (c) => {
		const body = await c.req.parseBody();
		const raw = Object.fromEntries(
			Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
		);
		const parsed = BookingRequest.safeParse(raw);
		if (!parsed.success) {
			return c.html(
				<BookingForm
					locale={locale}
					values={raw}
					errors={errorsFor(parsed.error.issues, locale, raw)}
				/>,
			);
		}
		return c.html(<BookingDone locale={locale} name={parsed.data.name} />);
	});
	app.post(`${prefix}/ghid`, async (c) => {
		const parsed = AskBody.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) return c.body(null, 204);
		return streamAnswer(c, locale, parsed.data.question);
	});
}

if (process.env.NODE_ENV !== "test") {
	serve({ fetch: app.fetch, port: PORT }, (info) =>
		console.log(`psizone-web on http://localhost:${info.port}`),
	);
}
