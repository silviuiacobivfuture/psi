import { addDays } from "../lib/dates";
import type { AuditEvent } from "./schema";

const pad = (n: number): string => String(n).padStart(2, "0");

type Draft = Pick<AuditEvent, "actor" | "action" | "target"> & Partial<AuditEvent>;

/**
 * Twelve synthetic events across the kinds of work the journal shows: who did them (a person, the assistant, the public
 * site, an import, a service key), the object, the field-level change, and where each came from.
 */
export function seedAudit(today: string, clientCount: number): AuditEvent[] {
	const client = (i: number): string => `client:c${(i % clientCount) + 1}`;
	const drafts: ReadonlyArray<Draft> = [
		{
			actor: "Recepție Exemplu",
			action: "appointment.create",
			target: "appointment:a3",
			changes: [{ field: "status", before: null, after: "confirmed" }],
		},
		{
			actor: "Terapeut Alfa",
			action: "appointment.cancel",
			target: "appointment:a4",
			reason: "Clientul a anunțat că e bolnav",
			changes: [{ field: "status", before: "confirmed", after: "cancelled" }],
		},
		{
			actor: "Recepție Exemplu",
			action: "client.edit",
			target: client(2),
			changes: [
				{ field: "phone", before: "0700 000 001", after: "0700 000 021" },
				{ field: "note", before: null, after: "Preferă dimineața" },
			],
		},
		{ actor: "Terapeut Alfa", action: "package.payment", target: "package:k1" },
		{ actor: "Recepție Exemplu", action: "reminder.send", target: "reminder:a6" },
		{
			actor: "Asistent · Recepție Exemplu",
			action: "assistant.client.create",
			target: client(5),
			source: "assistant",
		},
		{
			actor: "Formular site",
			action: "request.handled",
			target: "request:w1",
			source: "site",
			ip: "198.51.100.23",
			device: "Safari pe iPhone",
		},
		{
			actor: "Terapeut Alfa",
			action: "appointment.edit",
			target: "appointment:a9",
			changes: [
				{ field: "startMin", before: "600", after: "660" },
				{ field: "durationMin", before: "50", after: "60" },
			],
		},
		{
			actor: "Import Psizone",
			action: "client.create",
			target: client(7),
			source: "import",
		},
		{
			actor: "Cheie API · psizone-web",
			action: "appointment.create",
			target: "appointment:a11",
			source: "api-key",
			ip: "203.0.113.7",
		},
		{ actor: "Recepție Exemplu", action: "client.archive", target: client(9) },
		{ actor: "Recepție Exemplu", action: "package.edit", target: "package:k2" },
	];
	return drafts.map((d, i) => ({
		id: `e${i + 1}`,
		at: `${addDays(today, -Math.floor(i / 3))}T${pad(9 + i)}:${pad((i * 7) % 60)}:00`,
		targetType: d.target.slice(0, d.target.indexOf(":")),
		targetId: d.target.slice(d.target.indexOf(":") + 1),
		source: "console",
		requestId: `req-seed-${pad(i + 1)}`,
		// What the console itself did carries the person's address and browser; an import carries neither.
		...(d.source === undefined ? { ip: "192.0.2.10", device: "Chrome pe Linux" } : {}),
		...d,
	}));
}
