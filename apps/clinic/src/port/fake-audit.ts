import type { Appointment, AppointmentPatch, AuditChange } from "./schema";

const text = (v: unknown): string | null =>
	v === null || v === undefined ? null : Array.isArray(v) ? v.join(",") : String(v);

/** The fields a patch really changed on an appointment, as the service would record them (raw values, field names). */
export function appointmentChanges(before: Appointment, patch: AppointmentPatch): AuditChange[] {
	const out: AuditChange[] = [];
	const known: Record<string, unknown> = before;
	for (const [field, value] of Object.entries(patch)) {
		if (value === undefined) continue;
		const was = known[field];
		if (text(was) === text(value)) continue;
		out.push({ field, before: text(was), after: text(value) });
	}
	return out;
}
