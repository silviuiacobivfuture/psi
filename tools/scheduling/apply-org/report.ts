import type { ApplyReport } from "./apply";
import type { Step } from "./plan-org";
import type { ProfileStep } from "./profile";

const pad = (rows: ReadonlyArray<ReadonlyArray<string>>): string[] => {
	const widths = rows.reduce<number[]>(
		(w, r) => r.map((cell, i) => Math.max(w[i] ?? 0, [...cell].length)),
		[],
	);
	return rows.map((r) =>
		r
			.map((cell, i) => cell + " ".repeat(Math.max(0, (widths[i] ?? 0) - [...cell].length)))
			.join("  ")
			.trimEnd(),
	);
};

const steps = <R>(
	title: string,
	list: ReadonlyArray<Step<R>>,
	detail: (r: R) => string,
): string[] =>
	list.length === 0
		? []
		: [
				title,
				...pad(
					list.map((s) => [`  ${s.kind}`, s.label, detail(s.kind === "keep" ? s.before : s.next)]),
				),
			];

/** The run as tables a person reads: which old room became which, what was left, and the organisation's rows. */
export function formatReport(r: ApplyReport): string {
	const out: string[] = [
		`${r.app}${r.dryRun ? " (dry run: nothing written)" : ""}`,
		"rooms (old room -> the owner's room)",
		...pad([
			["  step", "old room", "", "room", "floor", "appointments", "id"],
			...r.mapping.map((m) => [
				`  ${m.kind}`,
				m.from ?? "(new)",
				"->",
				m.to,
				m.floor,
				String(m.appointments),
				m.id,
			]),
		]),
	];
	if (r.left.length > 0)
		out.push(
			"old rooms that are none of the owner's",
			...pad(
				r.left.map((l) => [
					`  ${l.kind}`,
					l.name,
					`${l.appointments} appointments`,
					l.kind === "untouched" ? "left as it is" : "kept, inactive, off the plan",
					l.id,
				]),
			),
		);
	out.push(
		`floor plan: ${r.plan.saved ? (r.dryRun ? "would be saved" : `saved at revision ${r.plan.revision}`) : `unchanged at revision ${r.plan.revision}`}`,
		`appointments: ${r.appointments.total}, ${r.appointments.withRoom} with a room, ${r.appointments.moved} moved`,
	);
	if (r.catalog !== undefined)
		out.push(
			...steps("organisation", [r.catalog.app], (a) => a.name),
			...steps("devices", r.catalog.devices, (d) => `${d.deviceType ?? ""} in ${d.roomId ?? "-"}`),
			...steps("groups", r.catalog.groups, (g) => g.kind),
		);
	if (r.staff !== undefined)
		out.push(
			...steps(
				"services",
				r.staff.services,
				(s) =>
					`${s.name.ro}, ${s.durationMinutes} min, ${s.active ? "active" : "draft (inactive)"}, ${s.prices === undefined ? "no price" : `${s.prices.priceCents / 100} ${s.prices.currency}`}`,
			),
			...steps(
				"practitioners",
				r.staff.people,
				(p) =>
					`${p.subject === undefined ? "no account" : "account linked"}, rooms ${(p.roomIds ?? []).join(",") || "-"}`,
			),
			`practitioners with no sign-in account: ${r.staff.unlinked.join(", ") || "none"}`,
		);
	if (r.profile !== undefined) out.push(profileLine(r.profile, r.dryRun));
	return out.join("\n");
}

/** The contact profile's fate in one line: which fields the seed filled (never their values), or that it was kept. */
export function profileLine(p: ProfileStep, dryRun: boolean): string {
	switch (p.kind) {
		case "keep":
			return `contact profile: kept at revision ${p.revision} (every field the seed has is already set)`;
		case "save":
			return `contact profile: ${dryRun ? "would fill" : `filled at revision ${p.revision}:`} ${p.fields.join(", ")}`;
		default: {
			const never: never = p;
			return never;
		}
	}
}
