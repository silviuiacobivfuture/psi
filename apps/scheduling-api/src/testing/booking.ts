import type { Populated } from "./populate";
import { HOUR, NOW, type Reply } from "./world";

const A = "/v1/apps/psizone";

/** A call of the Psizone site (its service key), for the visitor it names (`x-psi-subject`), when it names one. */
export const asSite = (
	w: Populated,
	method: string,
	path: string,
	body?: unknown,
	subject?: string,
): Promise<Reply> =>
	w.callKey(
		"psizone-web",
		method,
		`${A}${path}`,
		body,
		subject === undefined ? {} : { "x-psi-subject": subject },
	);

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

/** A request booked by a signed-in visitor through the site, at the `nth` free slot. */
export async function bookAs(
	w: Populated,
	subject: string,
	at: number | Slot = 0,
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
			contact: { name: "Visitor Test", email: "visitor@example.test" },
		},
		subject,
	);
	if (sent.status !== 200) throw new Error(`booking answered ${sent.status}`);
	return { reference: String(sent.json.reference) };
}

/** One of the visitor's own appointments, as the site reads it. */
export interface OwnRow {
	id: string;
	reference: string;
	status: string;
	start: number;
	canChange: boolean;
	practitioner?: string;
}

/** The visitor's own appointments, as the site reads them. */
export async function mineOf(w: Populated, subject: string): Promise<OwnRow[]> {
	return (await asSite(w, "GET", "/me/appointments", undefined, subject)).json.items as OwnRow[];
}
