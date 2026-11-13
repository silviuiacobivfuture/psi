import { z } from "zod";
import { todayIn } from "./format";
import type { StaffSession } from "./session";

export const MAX_AGENDA_ROWS = 60;

const Candidates = z.array(z.object({ id: z.string(), name: z.string() }));
export const Ambiguous = z.object({
	status: z.literal("ambiguous"),
	candidates: Candidates,
});
export const NoMatch = z.object({ status: z.literal("none") });

export function today(session: StaffSession): string {
	return todayIn(session.timeZone, session.now());
}

export const refuse = (
	reason: "forbidden" | "not_found" | "conflict" | "invalid" | "unavailable",
) => ({ ok: false, reason }) as const;

/** The data the model reads about an appointment: free text fenced, everything else as is. */
export const AppointmentOut = z.object({
	id: z.string(),
	date: z.string(),
	weekday: z.string(),
	when: z.string(),
	status: z.string(),
	who: z.string().nullable(),
	resources: z.array(z.string()),
	note: z.string().nullable(),
});
export type AppointmentOut = z.infer<typeof AppointmentOut>;

export function resourceNames(
	resources: ReadonlyArray<{ id: string; name: string }>,
	ids: ReadonlyArray<string>,
): Array<string> {
	return ids.map((id) => resources.find((r) => r.id === id)?.name ?? id);
}
