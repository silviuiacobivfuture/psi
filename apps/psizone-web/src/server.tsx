import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { decodeSlot, SchedulingUnavailable, schedulingFromEnv } from "@psi/guide";
import { accountMemory, answerGuidePost, applyIndexingPolicy, installDevLog } from "@psi/ui";
import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { getCookie } from "hono/cookie";
import { account } from "./account";
import { registerAccountRoutes } from "./account-routes";
import {
	BookingConfirm,
	BookingConfirmation,
	BookingDone,
	BookingForm,
	BookingRequest,
	BookingRequested,
	errorsFor,
	FormIdSchema,
	type SlotDay,
	slotDays,
} from "./booking";
import { accountLine, bookingAccount, guideForRequest } from "./booking-account";
import { registerCmsRevalidate } from "./cms";
import { registerContentPages } from "./content-routes";
import { mountControl } from "./control";
import { ESTATE, SITE } from "./estate";
import { guideLabels } from "./guide";
import { guide } from "./guide-client";
import { at, type Locale } from "./i18n";
import { pageResolver } from "./page-context";
import { ContactPage } from "./pages/contact";
import { HomePage } from "./pages/home";
import { PreparingPage, TeamPage } from "./pages/simple";
import { StoryPage } from "./pages/story";
import { m } from "./paraglide/messages.js";
import { registerPwa } from "./pwa/routes";
import { sitemap } from "./seo";
import { themeFrom } from "./theme";

const DATASTAR = readFileSync(
	createRequire(import.meta.url).resolve("@psi/ui/datastar.js"),
	"utf8",
);
const PORT = Number.parseInt(process.env.PORT ?? "4310", 10);

/**
 * Psizone's evaluation calendar (docs/plans/scheduling.md). Without `CONVEX_URL` it is off and
 * /contact is today's callback form, unchanged; so is any slot lookup that fails or times out.
 */
const SCHEDULING = schedulingFromEnv(process.env);
if (!SCHEDULING.ok && SCHEDULING.problem !== "no_url") {
	console.error(`scheduling: off (${SCHEDULING.problem})`);
}
const scheduling = SCHEDULING.ok ? SCHEDULING.scheduling.client : undefined;
const TENANT = "psizone";

/** The service the contact page offers times for: the store's first active one (an "evaluation" when it has one), or none. */
async function bookableService(): Promise<string | undefined> {
	if (scheduling === undefined) return undefined;
	const found = await scheduling.services(TENANT);
	const slugs = found?.services.map((s) => s.slug) ?? [];
	return slugs.find((s) => s === "evaluation") ?? slugs[0];
}
const TWO_WEEKS_MS = 14 * 86_400_000;

function schedulingFailed(error: unknown): void {
	const why = error instanceof SchedulingUnavailable ? error.message : "unexpected failure";
	console.error(`scheduling: ${why}`);
}

/** The next free evaluation times by day, or none (the callback form) when they cannot be read. */
async function evaluationSlots(locale: Locale): Promise<ReadonlyArray<SlotDay>> {
	if (scheduling === undefined) return [];
	try {
		const service = await bookableService();
		if (service === undefined) return [];
		const now = Date.now();
		const found = await scheduling.findSlots({
			tenant: TENANT,
			service,
			from: now,
			to: now + TWO_WEEKS_MS,
			limit: 24,
		});
		return found.ok ? slotDays(found.slots, found.timeZone, locale) : [];
	} catch (error) {
		schedulingFailed(error);
		return [];
	}
}

/** A form body as strings; files and repeated fields become empty. */
function formFields(body: Record<string, unknown>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
	);
}

export const app = new Hono({ strict: false });
installDevLog(app);
applyIndexingPolicy(app, process.env, {
	sitemap: `${ESTATE[SITE]}/sitemap.xml`,
});
app.use(contextStorage());
// The estate account: /auth/* (sign-in, callback, sign-out, back-channel logout); /cont below.
account.mount(app);
// The installable app and its notifications (docs/plans/pwa.md): manifest, /sw.js, push API, /cont/notificari.
registerPwa(app);
// The control plane (the CMS's /admin/platform): signed /__control/*, /admin → there, the Compass's staff link.
mountControl(app);
app.get("/sitemap.xml", async (c) =>
	c.body(await sitemap(app), 200, {
		"content-type": "application/xml; charset=utf-8",
		"cache-control": "public, max-age=3600",
	}),
);

app.get("/healthz", (c) => c.text("ok"));
// The shared CMS's signed webhook: published prices refresh at once (cms.ts).
registerCmsRevalidate(app);
app.get("/assets/datastar.js", (c) =>
	c.body(DATASTAR, 200, {
		"content-type": "text/javascript; charset=utf-8",
		"cache-control": "public, max-age=86400",
	}),
);
app.use("/assets/*", serveStatic({ root: "./public" }));
// Photographs from the old psizone.ro, converted to webp (public/images/old-site).
app.use("/images/*", serveStatic({ root: "./public" }));
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
	registerContentPages(app, locale, prefix);
	registerAccountRoutes(app, locale);
	app.get(`${prefix}/povestea`, (c) =>
		c.html(
			<StoryPage
				locale={locale}
				theme={themeFrom(getCookie(c, "theme"))}
				origin={new URL(c.req.url).origin}
			/>,
		),
	);
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
	app.get(`${prefix}/contact`, async (c) => {
		const origin = new URL(c.req.url).origin;
		const who = await bookingAccount(c, locale, "/contact");
		c.header("cache-control", "private, no-store");
		return c.html(
			<ContactPage
				locale={locale}
				theme={themeFrom(getCookie(c, "theme"))}
				origin={origin}
				slots={await evaluationSlots(locale)}
				booking={{
					values: who.prefill,
					...(who.form === undefined ? {} : { account: who.form }),
				}}
			/>,
		);
	});
	app.post(`${prefix}/programare`, async (c) => {
		const raw = formFields(await c.req.parseBody());
		const id = FormIdSchema.parse(raw.form);
		const who = await bookingAccount(c, locale, "/contact");
		const parsed = BookingRequest.safeParse(raw);
		if (!parsed.success) {
			return c.html(
				<BookingForm
					{...accountLine(who)}
					id={id}
					locale={locale}
					values={raw}
					errors={errorsFor(parsed.error.issues, locale, raw)}
					slots={await evaluationSlots(locale)}
				/>,
			);
		}
		const slot = decodeSlot(parsed.data.slot);
		// No slot chosen, or scheduling off: the callback request, exactly as before.
		if (scheduling === undefined || parsed.data.slot === "") {
			return c.html(<BookingDone id={id} locale={locale} name={parsed.data.name} />);
		}
		const retry = async () =>
			c.html(
				<BookingForm
					{...accountLine(who)}
					id={id}
					locale={locale}
					values={{ ...raw, slot: "" }}
					errors={{ slot: m.form_err_slot({}, at(locale)) }}
					slots={await evaluationSlots(locale)}
				/>,
			);
		if (slot === undefined) return retry();
		try {
			const service = await bookableService();
			if (service === undefined) return retry();
			const held = await scheduling.hold({
				tenant: TENANT,
				service,
				practitioner: slot.practitioner,
				start: slot.start,
				mode: slot.mode,
				locale,
				channel: "form",
			});
			if (!held.ok) return retry();
			return c.html(
				<BookingConfirm id={id} locale={locale} held={{ ...held, values: parsed.data }} />,
			);
		} catch (error) {
			schedulingFailed(error);
			return c.html(<BookingDone id={id} locale={locale} name={parsed.data.name} />);
		}
	});
	app.post(`${prefix}/programare/confirma`, async (c) => {
		const raw = formFields(await c.req.parseBody());
		const parsed = BookingConfirmation.safeParse(raw);
		const id = FormIdSchema.parse(raw.form);
		// Signed in: the request carries the account's hash, so it appears in /cont/programari.
		const who = await bookingAccount(c, locale, "/contact");
		const values = { ...raw, slot: "" };
		const again = async (errors: Parameters<typeof BookingForm>[0]["errors"]) =>
			c.html(
				<BookingForm
					{...accountLine(who)}
					id={id}
					locale={locale}
					values={values}
					errors={errors}
					slots={await evaluationSlots(locale)}
				/>,
			);
		if (!parsed.success || scheduling === undefined) {
			return again(parsed.success ? {} : errorsFor(parsed.error.issues, locale, raw));
		}
		const { reference, holdToken, name, email, phone, forWhom } = parsed.data;
		try {
			const sent = await scheduling.submit({
				reference,
				holdToken,
				contact: { name, email, phone },
				audience: forWhom,
				...(who.accountHash === undefined ? {} : { accountHash: who.accountHash }),
			});
			if (!sent.ok) {
				return again(
					sent.reason === "invalid"
						? { contact: m.form_err_contact({}, at(locale)) }
						: { slot: m.form_err_hold({}, at(locale)) },
				);
			}
			return c.html(
				<BookingRequested
					id={id}
					{...(who.bookingsHref === undefined ? {} : { inAccount: who.bookingsHref })}
					locale={locale}
					name={name}
					reference={sent.reference}
					cancelCode={sent.cancelCode}
					cancelInChat={id !== "booking"}
					start={sent.start}
					timeZone={sent.timeZone}
				/>,
			);
		} catch (error) {
			schedulingFailed(error);
			return c.html(<BookingDone id={id} locale={locale} name={name} />);
		}
	});
	app.post(`${prefix}/programare/renunta`, async (c) => {
		const raw = formFields(await c.req.parseBody());
		if (scheduling !== undefined && raw.reference && raw.holdToken) {
			await scheduling
				.release({ reference: raw.reference, holdToken: raw.holdToken })
				.catch(schedulingFailed);
		}
		const { reference: _r, holdToken: _t, ...values } = raw;
		return c.html(
			<BookingForm
				{...accountLine(await bookingAccount(c, locale, "/contact"))}
				id={FormIdSchema.parse(raw.form)}
				locale={locale}
				values={{ ...values, slot: "" }}
				slots={await evaluationSlots(locale)}
			/>,
		);
	});
	// The guide: a question streams its answer; the compass also restores and resets its chat here.
	app.post(`${prefix}/ghid`, async (c) => {
		// Signed in: the in-chat form is pre-filled, and the guide remembers only with consent.
		const who = await bookingAccount(c, locale, "/contact");
		return answerGuidePost(c, {
			locale,
			labels: guideLabels(locale, {
				prefill: who.prefill,
				...accountLine(who),
			}),
			guide: () => guideForRequest(c, guide),
			memory: () => accountMemory(account, c, "psizone"),
			page: pageResolver,
		});
	});
}

if (process.env.NODE_ENV !== "test") {
	serve({ fetch: app.fetch, port: PORT }, (info) =>
		console.log(`psizone-web on http://localhost:${info.port}`),
	);
}
