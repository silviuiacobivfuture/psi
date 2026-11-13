/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { type CallbackRequest, decodeSlot } from "@psi/scheduling";
import type { Context, Hono } from "hono";
import type { BookingDeps } from "./deps";
import { BookingForm } from "./form";
import { pickService } from "./picker";
import { BookingConfirm, BookingDone, BookingFailed, BookingRequested } from "./results";
import { formFields, isChat, scheduleOf } from "./routes";
import {
	BookingConfirmation,
	BookingRequest,
	errorsFor,
	FormIdSchema,
	withAudience,
} from "./schemas";
import type { BookingErrors, BookingLocale } from "./types";

/**
 * The page the form was on (its Referer's path); when that is not a plain site path, the contact
 * page in its canonical (Romanian) path, whatever the form's language.
 */
function pageOf(c: Context, contact: string): string {
	const referer = c.req.header("referer");
	if (referer === undefined) return contact;
	try {
		const path = new URL(referer).pathname;
		return /^\/[A-Za-z0-9/_-]{0,100}$/.test(path) ? path : contact;
	} catch {
		return contact;
	}
}

/**
 * The booking form's POST routes: a chosen time is held, then confirmed; everything else is a
 * callback request, which is STORED and E-MAILED to the team before the visitor is thanked. If
 * neither worked the visitor is told so (with the site's phones, when it has any): a request is
 * never dropped silently. Every call to the store carries `deps.site.tenant`.
 */
export function registerBookingSubmit(app: Hono, deps: BookingDeps, locale: BookingLocale): void {
	const { scheduling, picker, intake, site } = deps;
	const tenant = site.tenant;
	const env = site.env(locale);
	const { copy, routes } = env;
	const account = (c: Context) => site.account(c, locale, routes.contact);
	const callback = async (
		c: Context,
		id: string,
		request: Omit<CallbackRequest, "locale" | "channel" | "page">,
		name: string,
	) => {
		const taken = await intake.take({
			...request,
			locale,
			channel: isChat(id) ? "guide" : "form",
			page: pageOf(c, site.env("ro").routes.contact),
			consent: true,
		});
		return c.html(
			taken.stored || taken.mailed ? (
				<BookingDone id={id} env={env} name={name} />
			) : (
				<BookingFailed id={id} env={env} />
			),
		);
	};
	app.post(routes.booking, async (c) => {
		const raw = withAudience(formFields(await c.req.parseBody()), env);
		const id = FormIdSchema.parse(raw.form);
		const who = await account(c);
		const form = async (errors: BookingErrors, values: Record<string, string>, taken = false) => {
			const schedule = await scheduleOf(picker, values, { taken });
			return c.html(
				<BookingForm
					{...(who.form === undefined ? {} : { account: who.form })}
					id={id}
					env={env}
					values={values}
					errors={errors}
					compact={isChat(id)}
					{...(schedule === undefined ? {} : { schedule })}
				/>,
			);
		};
		const parsed = BookingRequest.safeParse(raw);
		if (!parsed.success) return form(errorsFor(parsed.error.issues, copy, raw), raw);
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
		if (slot === undefined) return form({ slot: copy.errors.slot }, raw);
		try {
			const services = await picker.services();
			const service = pickService(services, v.service);
			// The time must be one of THIS site's people for THIS site's service: a slot id carries a
			// practitioner, and the browser's word for who it belongs to is never taken.
			const offered = service?.practitioners.some((p) => p.id === slot.practitioner) === true;
			if (service === undefined || (v.service !== "" && service.slug !== v.service) || !offered) {
				return form({ slot: copy.errors.slot }, raw);
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
			return c.html(<BookingConfirm id={id} env={env} held={{ ...held, values: v }} />);
		} catch (error) {
			deps.failed(error);
			// The calendar could not hold the time: the request still reaches the team, with the time asked for.
			return callback(c, id, { ...request, preferredStart: slot.start }, v.name);
		}
	});
	app.post(routes.confirm, async (c) => {
		const raw = withAudience(formFields(await c.req.parseBody()), env);
		const parsed = BookingConfirmation.safeParse(raw);
		const id = FormIdSchema.parse(raw.form);
		// Signed in: the request carries the account's hash, so it appears in the account's bookings.
		const who = await account(c);
		const again = async (errors: BookingErrors) => {
			const schedule = await scheduleOf(picker, { ...raw, slot: "" });
			return c.html(
				<BookingForm
					{...(who.form === undefined ? {} : { account: who.form })}
					id={id}
					env={env}
					values={{ ...raw, slot: "" }}
					errors={errors}
					compact={isChat(id)}
					{...(schedule === undefined ? {} : { schedule })}
				/>,
			);
		};
		if (!parsed.success || scheduling === undefined) {
			return again(parsed.success ? {} : errorsFor(parsed.error.issues, copy, raw));
		}
		const { reference, holdToken, name, email, phone, forWhom, when, start } = parsed.data;
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
					sent.reason === "invalid" ? { contact: copy.errors.contact } : { slot: copy.errors.hold },
				);
			}
			return c.html(
				<BookingRequested
					id={id}
					{...(who.bookingsHref === undefined ? {} : { inAccount: who.bookingsHref })}
					env={env}
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
	app.post(routes.release, async (c) => {
		const raw = formFields(await c.req.parseBody());
		if (scheduling !== undefined && raw.reference && raw.holdToken) {
			await scheduling
				.release({ reference: raw.reference, holdToken: raw.holdToken })
				.catch(deps.failed);
		}
		const { reference: _r, holdToken: _t, ...values } = raw;
		const id = FormIdSchema.parse(raw.form);
		const schedule = await scheduleOf(picker, { ...values, slot: "" });
		const who = await account(c);
		return c.html(
			<BookingForm
				{...(who.form === undefined ? {} : { account: who.form })}
				id={id}
				env={env}
				values={{ ...values, slot: "" }}
				compact={isChat(id)}
				{...(schedule === undefined ? {} : { schedule })}
			/>,
		);
	});
}
