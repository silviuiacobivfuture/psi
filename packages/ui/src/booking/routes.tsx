/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Context, Hono } from "hono";
import type { BookingDeps } from "./deps";
import { BookingForm } from "./form";
import { type Picker, PickerChoices, type PickerView } from "./picker";
import type { Schedule } from "./schedule";
import { FormIdSchema } from "./schemas";
import type { BookingLocale } from "./types";

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
	source: Picker,
	raw: Readonly<Record<string, string>>,
	options: { taken?: boolean } = {},
): Promise<Schedule | undefined> {
	if (!source.enabled) return undefined;
	const view: PickerView = await source.view(PickerChoices.parse(raw));
	const shown: PickerView =
		options.taken === true && view.kind === "ready"
			? {
					kind: "ready",
					data: { ...view.data, taken: true, selected: undefined },
				}
			: view;
	const noCallback = raw.nocall === "1";
	return {
		view: shown,
		callback: raw.callback === "1" && !noCallback,
		cards: raw.cards === "1",
		horizon: PickerChoices.parse(raw).horizon,
		noCallback,
	};
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
 * The route every picker change posts to. The answer is the whole form again, from the store's
 * current times, with what the visitor typed kept: the browser's choices are inputs to a query,
 * never facts.
 */
export function registerBookingSlots(app: Hono, deps: BookingDeps, locale: BookingLocale): void {
	const env = deps.site.env(locale);
	app.post(env.routes.slots, async (c) => {
		const raw = withQuery(c, formFields(await c.req.parseBody()));
		const id = FormIdSchema.parse(raw.form);
		const who = await deps.site.account(c, locale, env.routes.contact);
		const schedule = await scheduleOf(deps.picker, raw);
		c.header("cache-control", "private, no-store");
		return c.html(
			<BookingForm
				env={env}
				{...(who.form === undefined ? {} : { account: who.form })}
				id={id}
				values={raw}
				compact={isChat(id)}
				{...(schedule === undefined ? {} : { schedule })}
			/>,
		);
	});
}
