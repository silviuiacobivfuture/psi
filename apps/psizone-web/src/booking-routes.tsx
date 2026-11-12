import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { BookingForm, FormIdSchema } from "./booking";
import { accountLine, bookingAccount } from "./booking-account";
import { type Picker, PickerChoices, type PickerView } from "./booking-picker";
import type { Schedule } from "./booking-schedule";
import { picker } from "./booking-store";
import type { Locale } from "./i18n";
import { BookingPage } from "./pages/booking";
import { themeFrom } from "./theme";

/** A form body as strings; files and repeated fields become empty. */
export function formFields(body: Record<string, unknown>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
	);
}

/**
 * The schedule a booking form draws, read from the store for this request: undefined when
 * scheduling is off (the callback form alone), an "unavailable" view when the store cannot be read.
 * `taken` marks the time the visitor held as gone (a hold that lost the race).
 */
export async function scheduleOf(
	raw: Readonly<Record<string, string>>,
	options: { taken?: boolean; source?: Picker } = {},
): Promise<Schedule | undefined> {
	const source = options.source ?? picker;
	if (!source.enabled) return undefined;
	const view: PickerView = await source.view(PickerChoices.parse(raw));
	const shown: PickerView =
		options.taken === true && view.kind === "ready"
			? { kind: "ready", data: { ...view.data, taken: true, selected: undefined } }
			: view;
	return { view: shown, callback: raw.callback === "1", cards: raw.cards === "1" };
}

/** The chat's forms are the compact ones; the page's own form id is "booking". */
export function isChat(id: string): boolean {
	return id !== "booking";
}

/** `?week=` and `?callback=` on the URL are the buttons' choices; they win over the form's hidden fields. */
function withQuery(c: Context, raw: Record<string, string>): Record<string, string> {
	const week = c.req.query("week");
	const callback = c.req.query("callback");
	return {
		...raw,
		...(week === undefined ? {} : { week, day: "", slot: "" }),
		...(callback === undefined ? {} : { callback: callback === "1" ? "1" : "" }),
	};
}

/**
 * The booking page (service cards, the picker, then the details) and the route every picker
 * change posts to. The answer is the whole form again, from the store's current times, with what
 * the visitor typed kept: the browser's choices are inputs to a query, never facts.
 */
export function registerBookingRoutes(app: Hono, locale: Locale, prefix: string): void {
	app.get(`${prefix}/programare`, async (c) => {
		const origin = new URL(c.req.url).origin;
		const who = await bookingAccount(c, locale, "/programare");
		const asked = c.req.query("serviciu") ?? "";
		const schedule = await scheduleOf({ service: asked, cards: "1" });
		c.header("cache-control", "private, no-store");
		return c.html(
			<BookingPage
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
	app.post(`${prefix}/programare/ore`, async (c) => {
		const raw = withQuery(c, formFields(await c.req.parseBody()));
		const id = FormIdSchema.parse(raw.form);
		const who = await bookingAccount(c, locale, "/contact");
		const schedule = await scheduleOf(raw);
		c.header("cache-control", "private, no-store");
		return c.html(
			<BookingForm
				{...accountLine(who)}
				id={id}
				locale={locale}
				values={raw}
				compact={isChat(id)}
				{...(schedule === undefined ? {} : { schedule })}
			/>,
		);
	});
}
