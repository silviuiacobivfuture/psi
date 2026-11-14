import { decodeSlot } from "@psi/guide";
import type { Context, Hono } from "hono";
import {
	BookingConfirm,
	BookingConfirmation,
	BookingDone,
	BookingForm,
	BookingRequest,
	BookingRequested,
	errorsFor,
	type FormId,
	FormIdSchema,
} from "./booking";
import { accountLine, bookingAccount } from "./booking-account";
import { BookingFailed } from "./booking-failed";
import { type Picker, pickService } from "./booking-picker";
import { formFields, isChat, scheduleOf } from "./booking-routes";
import type { Intake } from "./callback-intake";
import type { CallbackRequest } from "./callback-mail";
import { at, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import type { VisitorScheduling } from "./scheduling-api-client";

/** What the booking POST routes work with: the scheduling store, the calendar picker, the intake. */
export interface BookingDeps {
	scheduling: VisitorScheduling | undefined;
	picker: Picker;
	intake: Intake;
	tenant: string;
	/** Says a scheduling failure (never any visitor data). */
	failed: (error: unknown) => void;
}

/** The page the form was on (its Referer's path), "/contact" when that is not a plain site path. */
function pageOf(c: Context): string {
	const referer = c.req.header("referer");
	if (referer === undefined) return "/contact";
	try {
		const path = new URL(referer).pathname;
		return /^\/[A-Za-z0-9/_-]{0,100}$/.test(path) ? path : "/contact";
	} catch {
		return "/contact";
	}
}

/**
 * The booking form's POST routes: a chosen time is held, then confirmed; everything else is a
 * callback request, which is STORED and E-MAILED to the team before the visitor is thanked. If
 * neither worked the visitor is told so and given the phones: a request is never dropped silently.
 */
export function registerBookingSubmit(
	app: Hono,
	locale: Locale,
	prefix: string,
	deps: BookingDeps,
): void {
	const { scheduling, picker, intake, tenant } = deps;
	const callback = async (
		c: Context,
		id: FormId,
		request: Omit<CallbackRequest, "locale" | "channel" | "page">,
		name: string,
	) => {
		const taken = await intake.take({
			...request,
			locale,
			channel: isChat(id) ? "guide" : "form",
			page: pageOf(c),
			consent: true,
		});
		return c.html(
			taken.stored || taken.mailed ? (
				<BookingDone id={id} locale={locale} name={name} />
			) : (
				<BookingFailed id={id} locale={locale} />
			),
		);
	};
	app.post(`${prefix}/programare`, async (c) => {
		const raw = formFields(await c.req.parseBody());
		const id = FormIdSchema.parse(raw.form);
		const who = await bookingAccount(c, locale, "/contact");
		const form = async (
			errors: Parameters<typeof BookingForm>[0]["errors"],
			values: Record<string, string>,
			taken = false,
		) => {
			const schedule = await scheduleOf(values, { taken, source: picker });
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
		const v = parsed.data;
		const request = {
			name: v.name,
			email: v.email,
			phone: v.phone,
			forWhom: v.forWhom,
			when: v.when,
			...(v.service === "" ? {} : { service: v.service }),
		};
		const slot = decodeSlot(v.slot);
		// No slot chosen, or scheduling off: the callback request, stored and e-mailed.
		if (scheduling === undefined || v.slot === "") return callback(c, id, request, v.name);
		// A time the page did not offer for this service is never held: the form is shown again.
		if (slot === undefined) return form({ slot: m.form_err_slot({}, at(locale)) }, raw);
		try {
			const services = await picker.services();
			const service = pickService(services, v.service);
			if (service === undefined || (v.service !== "" && service.slug !== v.service)) {
				return form({ slot: m.form_err_slot({}, at(locale)) }, raw);
			}
			const held = await scheduling.hold({
				tenant,
				service: service.slug,
				practitioner: slot.practitioner,
				start: slot.start,
				mode: slot.mode,
				locale,
				channel: "form",
			});
			// The time went between view and submit: the picker comes back with the free times.
			if (!held.ok) return form({}, { ...raw, slot: "" }, held.reason === "slot_taken");
			return c.html(<BookingConfirm id={id} locale={locale} held={{ ...held, values: v }} />);
		} catch (error) {
			deps.failed(error);
			// The calendar could not hold the time: the request still reaches the team, with the time asked for.
			return callback(c, id, { ...request, preferredStart: slot.start }, v.name);
		}
	});
	app.post(`${prefix}/programare/confirma`, async (c) => {
		const raw = formFields(await c.req.parseBody());
		const parsed = BookingConfirmation.safeParse(raw);
		const id = FormIdSchema.parse(raw.form);
		// Signed in: the request carries the account's hash, so it appears in /cont/programari.
		const who = await bookingAccount(c, locale, "/contact");
		const again = async (errors: Parameters<typeof BookingForm>[0]["errors"]) => {
			const schedule = await scheduleOf({ ...raw, slot: "" }, { source: picker });
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
		const { reference, holdToken, name, email, phone, forWhom, when, start } = parsed.data;
		try {
			const sent = await scheduling.submit({
				reference,
				holdToken,
				contact: { name, email, phone },
				audience: forWhom,
				...(who.subject === undefined ? {} : { subject: who.subject }),
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
			deps.failed(error);
			// The held time could not be requested: the request still reaches the team, with that time.
			return callback(
				c,
				id,
				{
					name,
					email,
					phone,
					forWhom,
					when,
					...(start === "" ? {} : { preferredStart: Number(start) }),
				},
				name,
			);
		}
	});
	app.post(`${prefix}/programare/renunta`, async (c) => {
		const raw = formFields(await c.req.parseBody());
		if (scheduling !== undefined && raw.reference && raw.holdToken) {
			await scheduling
				.release({ reference: raw.reference, holdToken: raw.holdToken })
				.catch(deps.failed);
		}
		const { reference: _r, holdToken: _t, ...values } = raw;
		const id = FormIdSchema.parse(raw.form);
		const schedule = await scheduleOf({ ...values, slot: "" }, { source: picker });
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
}
