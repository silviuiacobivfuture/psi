import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { decodeSlot } from "@psi/guide";
import { guideSignal } from "@psi/site-control";
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
} from "./booking";
import { accountLine, bookingAccount, guideForRequest } from "./booking-account";
import { pickService } from "./booking-picker";
import { formFields, isChat, registerBookingRoutes, scheduleOf } from "./booking-routes";
import { picker, scheduling, schedulingFailed, TENANT } from "./booking-store";
import { registerCmsRevalidate } from "./cms";
import { registerContentPages } from "./content-routes";
import { mountControl } from "./control";
import { ESTATE, SITE } from "./estate";
import { guideLabels } from "./guide";
import { guide, guideCounts } from "./guide-client";
import { at, type Locale } from "./i18n";
import { pageRegistry, pageResolver } from "./page-context";
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
	registerBookingRoutes(app, locale, prefix);
	app.get(`${prefix}/contact`, async (c) => {
		const origin = new URL(c.req.url).origin;
		const who = await bookingAccount(c, locale, "/contact");
		const schedule = await scheduleOf({});
		c.header("cache-control", "private, no-store");
		return c.html(
			<ContactPage
				locale={locale}
				theme={themeFrom(getCookie(c, "theme"))}
				origin={origin}
				{...(schedule === undefined ? {} : { schedule })}
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
		const form = async (
			errors: Parameters<typeof BookingForm>[0]["errors"],
			values: Record<string, string>,
			taken = false,
		) => {
			const schedule = await scheduleOf(values, { taken });
			return c.html(
				<BookingForm
					{...accountLine(who)}
					id={id}
					locale={locale}
					values={values}
					errors={errors}
					compact={isChat(id)}
					{...(schedule === undefined ? {} : { schedule })}
				/>,
			);
		};
		const parsed = BookingRequest.safeParse(raw);
		if (!parsed.success) return form(errorsFor(parsed.error.issues, locale, raw), raw);
		const slot = decodeSlot(parsed.data.slot);
		// No slot chosen, or scheduling off: the callback request, exactly as before.
		if (scheduling === undefined || parsed.data.slot === "") {
			return c.html(<BookingDone id={id} locale={locale} name={parsed.data.name} />);
		}
		// A time the page did not offer for this service is never held: the form is shown again.
		if (slot === undefined) return form({ slot: m.form_err_slot({}, at(locale)) }, raw);
		try {
			const services = await picker.services();
			const service = pickService(services, parsed.data.service);
			if (
				service === undefined ||
				(parsed.data.service !== "" && service.slug !== parsed.data.service)
			) {
				return form({ slot: m.form_err_slot({}, at(locale)) }, raw);
			}
			const held = await scheduling.hold({
				tenant: TENANT,
				service: service.slug,
				practitioner: slot.practitioner,
				start: slot.start,
				mode: slot.mode,
				locale,
				channel: "form",
			});
			// The time went between view and submit: the picker comes back with the free times.
			if (!held.ok) return form({}, { ...raw, slot: "" }, held.reason === "slot_taken");
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
		const again = async (errors: Parameters<typeof BookingForm>[0]["errors"]) => {
			const schedule = await scheduleOf({ ...raw, slot: "" });
			return c.html(
				<BookingForm
					{...accountLine(who)}
					id={id}
					locale={locale}
					values={{ ...raw, slot: "" }}
					errors={errors}
					compact={isChat(id)}
					{...(schedule === undefined ? {} : { schedule })}
				/>,
			);
		};
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
					cancelInChat={isChat(id)}
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
		const id = FormIdSchema.parse(raw.form);
		const schedule = await scheduleOf({ ...values, slot: "" });
		return c.html(
			<BookingForm
				{...accountLine(await bookingAccount(c, locale, "/contact"))}
				id={id}
				locale={locale}
				values={{ ...values, slot: "" }}
				compact={isChat(id)}
				{...(schedule === undefined ? {} : { schedule })}
			/>,
		);
	});
	// What the compass reports about its invitation: opened, nudge shown, nudge clicked (counters only).
	app.post(`${prefix}/ghid/signal`, guideSignal({ reporter: guideCounts, locale }));
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
			warm: pageRegistry.ensure,
		});
	});
}

// The guide reads the site's other pages as the site renders them (an anonymous GET of its own app).
pageRegistry.connect((path) => app.request(path));

if (process.env.NODE_ENV !== "test") {
	serve({ fetch: app.fetch, port: PORT }, (info) =>
		console.log(`psizone-web on http://localhost:${info.port}`),
	);
}
