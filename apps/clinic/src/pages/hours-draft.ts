import { DAY_MINUTES, formatClock } from "@psi/scheduling/domain";
import { z } from "zod";
import type { AvailabilityRule } from "../port/availability-port";

/**
 * The weekly rules as the editor shows them: schedules (the regular week, an alternating week, a period that replaces
 * the regular week), each with its weekdays' intervals. The form posts the whole draft; the server changes it (an
 * interval added or removed, Monday copied to the working days) and shows it again, unsaved, until Save. Rules the
 * editor does not let a person change (a week A/B, a period schedule) travel in the form untouched, since a save
 * replaces every rule.
 */
export interface DraftRow {
	weekday: number;
	start: string;
	end: string;
	onsite: boolean;
	online: boolean;
}
export interface DraftSchedule {
	from: string;
	until: string;
	week: "" | "A" | "B";
	override: boolean;
	rows: DraftRow[];
}
export type Draft = DraftSchedule[];

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const WORKDAYS = [2, 3, 4, 5] as const;
/** The bounds of one posted draft (the service keeps at most 120 rules): a form beyond them is not read. */
const MAX_SCHEDULES = 12;
const MAX_ROWS = 160;

export const rowKey = (schedule: number, row: number): string => `s${schedule}.r${row}`;

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Week = z.enum(["", "A", "B"]).catch("");
const DateText = z
	.string()
	.regex(/^(\d{4}-\d{2}-\d{2})?$/)
	.catch("");
/** The posted form: string fields only (a checkbox is present when ticked). */
export const DraftForm = z.record(z.string(), z.string());

const indexes = (form: Record<string, string>, pattern: RegExp, limit: number): number[][] =>
	Object.keys(form)
		.flatMap((k) => {
			const match = pattern.exec(k);
			return match === null ? [] : [match.slice(1).map(Number)];
		})
		.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0))
		.slice(0, limit);

/** The draft a posted form describes, in its own order. */
export function draftOf(form: Record<string, string>): Draft {
	const schedules = indexes(form, /^s(\d+)\.from$/, MAX_SCHEDULES);
	const rows = indexes(form, /^s(\d+)\.r(\d+)\.d$/, MAX_ROWS);
	return schedules.map(([j = 0]) => ({
		from: DateText.parse(form[`s${j}.from`] ?? ""),
		until: DateText.parse(form[`s${j}.until`] ?? ""),
		week: Week.parse(form[`s${j}.week`] ?? ""),
		override: form[`s${j}.override`] === "1",
		rows: rows
			.filter(([s]) => s === j)
			.flatMap(([, k = 0]) => {
				const at = (f: string): string => form[`s${j}.r${k}.${f}`] ?? "";
				const weekday = Number(at("d"));
				if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return [];
				return [
					{
						weekday,
						start: at("start").slice(0, 5),
						end: at("end").slice(0, 5),
						onsite: at("onsite") !== "",
						online: at("online") !== "",
					},
				];
			}),
	}));
}

const clockOf = (minutes: number): string =>
	minutes >= DAY_MINUTES ? "00:00" : formatClock(minutes);
const scheduleKey = (r: AvailabilityRule): string =>
	[r.validFrom ?? "", r.validUntil ?? "", r.week ?? "", r.override === true].join("|");

/** The saved rules as schedules: the regular week first, then the others by their first date. */
export function draftFromRules(rules: ReadonlyArray<AvailabilityRule>): Draft {
	const groups = new Map<string, DraftSchedule>();
	for (const r of rules) {
		const key = scheduleKey(r);
		const held = groups.get(key) ?? {
			from: r.validFrom ?? "",
			until: r.validUntil ?? "",
			week: r.week ?? "",
			override: r.override === true,
			rows: [],
		};
		held.rows.push({
			weekday: r.weekday,
			start: clockOf(r.start),
			end: clockOf(r.end),
			onsite: r.modes.includes("onsite"),
			online: r.modes.includes("online"),
		});
		groups.set(key, held);
	}
	const order = (s: DraftSchedule): string =>
		`${s.override ? 1 : 0}${s.week === "" ? 0 : 1}${s.from === "" ? "0" : `1${s.from}`}${s.week}`;
	const draft = [...groups.values()].sort((a, b) => order(a).localeCompare(order(b)));
	for (const s of draft)
		s.rows.sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
	return draft.length === 0 ? [emptySchedule()] : draft;
}

const emptySchedule = (): DraftSchedule => ({
	from: "",
	until: "",
	week: "",
	override: false,
	rows: [],
});

/** A change the editor makes to the draft before it is saved. */
export type DraftOp =
	| { op: "add"; schedule: number; weekday: number }
	| { op: "remove"; schedule: number; row: number }
	| { op: "copy-monday"; schedule: number }
	| { op: "add-period"; from: string }
	| { op: "remove-schedule"; schedule: number };

const OP = /^(add|remove|copy-monday|remove-schedule):(\d+)(?::(\d+))?$/;

/** The button a person pressed, as a change of the draft; "save" (or nothing recognised) is null. */
export function opOf(value: string | undefined, today: string): DraftOp | null {
	if (value === "add-period") return { op: "add-period", from: today };
	const match = OP.exec(value ?? "");
	if (match === null) return null;
	const a = Number(match[2]);
	const b = Number(match[3] ?? "0");
	switch (match[1]) {
		case "add":
			return { op: "add", schedule: a, weekday: b };
		case "remove":
			return { op: "remove", schedule: a, row: b };
		case "copy-monday":
			return { op: "copy-monday", schedule: a };
		case "remove-schedule":
			return { op: "remove-schedule", schedule: a };
		default:
			return null;
	}
}

/** The draft after the change; nothing is saved. */
export function applyOp(draft: Draft, op: DraftOp): Draft {
	const next = draft.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r })) }));
	switch (op.op) {
		case "add": {
			const s = next[op.schedule];
			if (s === undefined) return next;
			const day = s.rows.filter((r) => r.weekday === op.weekday);
			const fresh = day.length === 0 ? { start: "09:00", end: "17:00" } : { start: "", end: "" };
			const last = s.rows.reduce((at, r, i) => (r.weekday <= op.weekday ? i + 1 : at), 0);
			s.rows.splice(last, 0, { weekday: op.weekday, ...fresh, onsite: true, online: true });
			return next;
		}
		case "remove": {
			next[op.schedule]?.rows.splice(op.row, 1);
			return next;
		}
		case "copy-monday": {
			const s = next[op.schedule];
			if (s === undefined) return next;
			const monday = s.rows.filter((r) => r.weekday === 1);
			const kept = s.rows.filter((r) => !(WORKDAYS as ReadonlyArray<number>).includes(r.weekday));
			const copies = WORKDAYS.flatMap((weekday) => monday.map((r) => ({ ...r, weekday })));
			s.rows = [...kept, ...copies].sort((a, b) => a.weekday - b.weekday);
			return next;
		}
		case "add-period":
			return [...next, { ...emptySchedule(), from: op.from, override: true }];
		case "remove-schedule":
			return next.length <= 1 ? next : next.filter((_, i) => i !== op.schedule);
		default: {
			const never: never = op;
			return never;
		}
	}
}

/** What the draft saves as: the rules in order, each with the row it came from; a row the form cannot read is named. */
export interface Built {
	rules: AvailabilityRule[];
	/** The row key of each rule, by the rule's index (what a refusal's `index` points at). */
	keys: string[];
	/** Rows with a time missing or unreadable (nothing is sent while there is one). */
	unreadable: string[];
	/** Rows with neither mode ticked (the contract does not carry such a rule: nothing is sent while there is one). */
	modeless: string[];
}

const minutesOf = (clock: string, end: boolean): number | null => {
	if (!Clock.safeParse(clock).success) return null;
	const [h = 0, m = 0] = clock.split(":").map(Number);
	const total = h * 60 + m;
	return end && total === 0 ? DAY_MINUTES : total;
};

export function buildRules(draft: Draft): Built {
	const out: Built = { rules: [], keys: [], unreadable: [], modeless: [] };
	draft.forEach((s, j) => {
		s.rows.forEach((r, k) => {
			if (r.start === "" && r.end === "") return;
			const start = minutesOf(r.start, false);
			const end = minutesOf(r.end, true);
			if (start === null || end === null) {
				out.unreadable.push(rowKey(j, k));
				return;
			}
			if (!r.onsite && !r.online) out.modeless.push(rowKey(j, k));
			out.rules.push({
				weekday: r.weekday,
				start,
				end,
				modes: [...(r.onsite ? ["onsite" as const] : []), ...(r.online ? ["online" as const] : [])],
				...(s.from === "" ? {} : { validFrom: s.from }),
				...(s.until === "" ? {} : { validUntil: s.until }),
				...(s.week === "" ? {} : { week: s.week }),
				...(s.override ? { override: true } : {}),
			});
			out.keys.push(rowKey(j, k));
		});
	});
	return out;
}
