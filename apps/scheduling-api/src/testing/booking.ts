import { OwnAppointment } from "@psi/scheduling-sdk/contract";
import { z } from "zod/v4";
import type { Populated } from "./populate";
import { bookingContact, HOUR, NOW, type Reply } from "./world";

const A = "/v1/apps/psizone";

/** A call of the Psizone site (its service key), for the visitor it names (`x-psi-subject`), when it names one. */
export const asSite = (
	w: Populated,
	method: string,
	path: string,
	body?: unknown,
	subject?: string,
	headers: Record<string, string> = {},
): Promise<Reply> =>
	w.callKey("psizone-web", method, `${A}${path}`, body, {
		...(subject === undefined ? {} : { "x-psi-subject": subject }),
		...headers,
	});

export interface Slot {
	practitioner: string;
	start: number;
	modes: ("onsite" | "online")[];
}

/** The free slots of the evaluation from `from` (default: now) for ten days. */
export async function freeSlots(w: Populated, from = NOW, limit = 20): Promise<Slot[]> {
	const r = await asSite(
		w,
		"GET",
		`/book/slots?service=evaluation&from=${from}&to=${from + 10 * 24 * HOUR}&limit=${limit}`,
	);
	return r.json.slots as Slot[];
}

/** A request booked by a signed-in visitor through the site, at the `nth` free slot, with this contact. */
export async function bookAs(
	w: Populated,
	subject: string,
	at: number | Slot = 0,
	contact: { email?: string; phone?: string } = {},
	headers: Record<string, string> = {},
): Promise<{ reference: string }> {
	const slot = typeof at === "number" ? (await freeSlots(w))[at] : at;
	if (slot === undefined) throw new Error("no free slot to book");
	const held = await asSite(w, "POST", "/book/holds", {
		service: "evaluation",
		practitioner: slot.practitioner,
		start: slot.start,
		mode: "onsite",
		locale: "ro",
		channel: "form",
	});
	const sent = await asSite(
		w,
		"POST",
		`/book/holds/${String(held.json.reference)}/submit`,
		{
			holdToken: String(held.json.holdToken),
			contact: bookingContact(contact),
		},
		subject,
		headers,
	);
	if (sent.status !== 200) throw new Error(`booking answered ${sent.status}`);
	return { reference: String(sent.json.reference) };
}

/** One of the visitor's own appointments, as the site reads it: the contract's own shape. */
export type OwnRow = z.output<typeof OwnAppointment>;

/** The visitor's own appointments, as the site reads them. */
export async function mineOf(w: Populated, subject: string): Promise<OwnRow[]> {
	return z
		.array(OwnAppointment)
		.parse((await asSite(w, "GET", "/me/appointments", undefined, subject)).json.items);
}
