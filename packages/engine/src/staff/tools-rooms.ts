import { z } from "zod";
import { resolveDatePhrase } from "./dates";
import type { CardRow, StaffCard } from "./events";
import { fenceOrNull } from "./fence";
import { addDays, clock, clockRange, dateLabel, foldName, minutesNowIn, weekStart } from "./format";
import { DateSchema, type Resource, type ResourceState } from "./model";
import { type StaffSession, staffTool, type ToolRun } from "./session";
import { refuse, today } from "./tools-shared";

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const minutesOf = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export function resolveDateTool(session: StaffSession) {
	const Out = z.union([
		z.object({
			status: z.literal("ok"),
			kind: z.literal("day"),
			date: z.string(),
			weekday: z.string(),
		}),
		z.object({
			status: z.literal("ok"),
			kind: z.literal("week"),
			date: z.string(),
			weekEnd: z.string(),
		}),
		z.object({ status: z.literal("none") }),
	]);
	return staffTool(session, {
		key: "resolveDate",
		phase: "read",
		description:
			'Turns a date said the way people say it ("mâine", "poimâine", "joia viitoare", "peste 2 săptămâni", "next friday", "săptămâna viitoare") into a calendar date. ALWAYS use it for a relative date; never count days yourself.',
		inputSchema: z.object({ phrase: z.string().trim().min(1).max(60) }).strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const found = resolveDatePhrase(input.phrase, today(s));
			if (!found.ok) return { ok: true, subjects: [], output: { status: "none" } };
			if (found.kind === "week") {
				return {
					ok: true,
					subjects: [],
					output: { status: "ok", kind: "week", date: found.date, weekEnd: found.weekEnd },
				};
			}
			return {
				ok: true,
				subjects: [],
				output: {
					status: "ok",
					kind: "day",
					date: found.date,
					weekday: new Intl.DateTimeFormat(s.copy.intl, {
						weekday: "long",
						timeZone: "UTC",
					}).format(new Date(`${found.date}T00:00:00Z`)),
				},
			};
		},
	});
}

function stateRows(s: StaffSession, states: ReadonlyArray<ResourceState>): Array<CardRow> {
	return states.map((st) => ({
		title: st.resource.name,
		subtitle:
			st.busy === null
				? undefined
				: `${clockRange(st.busy.startMin, st.busy.durationMin)}${st.busy.clientName ? ` · ${st.busy.clientName}` : ""}`,
		badge: st.busy === null ? s.copy.label.free : s.copy.label.busy,
		tone: st.busy === null ? "good" : "warn",
	}));
}

const StateOut = z.object({
	id: z.string(),
	name: z.string(),
	kind: z.string(),
	equipment: z.array(z.string()),
	free: z.boolean(),
	heldBy: z.string().nullable(),
	until: z.string().nullable(),
});

function stateOut(st: ResourceState): z.infer<typeof StateOut> {
	return {
		id: st.resource.id,
		name: st.resource.name,
		kind: st.resource.kind,
		equipment: st.resource.equipment ?? [],
		free: st.busy === null,
		heldBy: fenceOrNull(st.busy?.clientName),
		until: st.busy === null ? null : clock(st.busy.startMin + st.busy.durationMin),
	};
}

const When = {
	date: DateSchema.optional().describe("Day; today by default"),
	time: TimeSchema.optional().describe("HH:MM; now by default"),
	durationMin: z.number().int().min(5).max(480).default(50),
};

function whenOf(s: StaffSession, input: { date?: string | undefined; time?: string | undefined }) {
	return {
		date: input.date ?? today(s),
		startMin: input.time === undefined ? minutesNowIn(s.timeZone, s.now()) : minutesOf(input.time),
	};
}

export function roomsAtTool(session: StaffSession) {
	const Out = z.object({
		status: z.literal("ok"),
		date: z.string(),
		time: z.string(),
		resources: z.array(StateOut),
	});
	return staffTool(session, {
		key: "roomsAt",
		phase: "read",
		description:
			'The state of every room and device at a time (default: now): free, or held by whom until when. Use for "ce cabinete sunt ocupate acum" and for the floor plan.',
		inputSchema: z.object(When).strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const at = whenOf(s, input);
			const found = await s.port.roomsAt({ ...at, durationMin: input.durationMin });
			if (!found.ok) return refuse(found.reason);
			const card: StaffCard = {
				kind: "list",
				title: s.copy.card.rooms(`${dateLabel(s.copy, at.date)} ${clock(at.startMin)}`),
				empty: s.copy.card.noFreeRooms,
				rows: stateRows(s, found.value),
			};
			return {
				ok: true,
				subjects: found.value.map((st) => st.resource.id),
				cards: [card],
				output: {
					status: "ok",
					date: at.date,
					time: clock(at.startMin),
					resources: found.value.map(stateOut),
				},
			};
		},
	});
}

export function freeRoomsTool(session: StaffSession) {
	const Out = z.object({ status: z.enum(["ok", "none"]), rooms: z.array(StateOut) });
	return staffTool(session, {
		key: "freeRooms",
		phase: "read",
		description:
			'Rooms or devices that are free for a slot, optionally of one kind (room, device) and with equipment ("nfb", "group", "therapy"). Use for "ce sală liberă am joi la 10 pentru NFB".',
		inputSchema: z
			.object({
				...When,
				kind: z.enum(["room", "device"]).optional(),
				equipment: z.string().trim().min(1).max(40).optional(),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const at = whenOf(s, input);
			const found = await s.port.roomsAt({ ...at, durationMin: input.durationMin });
			if (!found.ok) return refuse(found.reason);
			const wanted = input.equipment === undefined ? undefined : foldName(input.equipment);
			const fits = (r: Resource): boolean =>
				(input.kind === undefined || r.kind === input.kind) &&
				(wanted === undefined || (r.equipment ?? []).some((e) => foldName(e).includes(wanted)));
			const free = found.value.filter((st) => st.busy === null && fits(st.resource));
			return {
				ok: true,
				subjects: free.map((st) => st.resource.id),
				cards: [
					{
						kind: "list",
						title: s.copy.card.freeRooms,
						empty: s.copy.card.noFreeRooms,
						rows: stateRows(s, free),
					},
				],
				output: { status: free.length === 0 ? "none" : "ok", rooms: free.map(stateOut) },
			};
		},
	});
}

export function attentionTool(session: StaffSession) {
	const Out = z.object({
		status: z.literal("ok"),
		period: z.object({ from: z.string(), to: z.string() }),
		clients: z.array(
			z.object({
				clientId: z.string(),
				name: z.string(),
				packageId: z.string(),
				sessionsLeft: z.number(),
				dueBani: z.number(),
				bookedInPeriod: z.number(),
				canEmail: z.boolean(),
				canWhatsapp: z.boolean(),
			}),
		),
	});
	return staffTool(session, {
		key: "attention",
		phase: "read",
		description:
			'Clients who owe a balance and/or have a package running out, with how many sessions they have booked in the period (this month by default). Use for "cine n-a plătit și are ședințe luna asta" and "ce abonamente se termină".',
		inputSchema: z
			.object({
				period: z.enum(["week", "month"]).default("month"),
				lowAt: z
					.number()
					.int()
					.min(0)
					.max(20)
					.default(2)
					.describe("A package with this many sessions left or fewer is running out"),
				onlyWithSessions: z
					.boolean()
					.default(false)
					.describe("Only clients who have sessions booked in the period"),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const day = today(s);
			const from = input.period === "week" ? weekStart(day) : day;
			const to =
				input.period === "week"
					? addDays(weekStart(day), 6)
					: new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0))
							.toISOString()
							.slice(0, 10);
			const found = await s.port.attention({ from, to, lowAt: input.lowAt });
			if (!found.ok) return refuse(found.reason);
			const shown = found.value
				.filter((a) => !input.onlyWithSessions || a.bookedInPeriod > 0)
				.slice(0, 30);
			const money = (bani: number) => `${(bani / 100).toFixed(2)} lei`;
			return {
				ok: true,
				subjects: shown.map((a) => a.clientId),
				cards: [
					{
						kind: "list",
						title: s.copy.card.attention,
						empty: s.copy.card.noAttention,
						rows: shown.map((a) => ({
							title: a.clientName,
							subtitle: s.copy.card.attentionLine({
								sessionsLeft: a.sessionsLeft,
								due: money(a.dueBani),
								booked: a.bookedInPeriod,
							}),
							tone: a.dueBani > 0 ? "warn" : "neutral",
						})),
					},
				],
				output: {
					status: "ok",
					period: { from, to },
					clients: shown.map((a) => ({
						clientId: a.clientId,
						name: fenceOrNull(a.clientName) ?? "",
						packageId: a.packageId,
						sessionsLeft: a.sessionsLeft,
						dueBani: a.dueBani,
						bookedInPeriod: a.bookedInPeriod,
						canEmail: a.canEmail,
						canWhatsapp: a.canWhatsapp,
					})),
				},
			};
		},
	});
}
