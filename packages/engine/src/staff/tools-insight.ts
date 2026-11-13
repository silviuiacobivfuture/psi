import { z } from "zod";
import type { CardRow } from "./events";
import { fence, fenceOrNull } from "./fence";
import { addDays, clock, dateLabel, weekStart } from "./format";
import { DateSchema, IdSchema } from "./model";
import { type StaffSession, staffTool, type ToolRun } from "./session";
import { refuse, today } from "./tools-shared";

/** A period asked as "today", "yesterday", "this week", or two days. */
const PeriodInput = {
	period: z.enum(["today", "yesterday", "week"]).default("today"),
	from: DateSchema.optional().describe("First day, to ask for an exact range"),
	to: DateSchema.optional(),
};

function rangeOf(
	s: StaffSession,
	input: { period: string; from?: string | undefined; to?: string | undefined },
) {
	const day = today(s);
	if (input.from !== undefined) return { from: input.from, to: input.to ?? input.from };
	if (input.period === "yesterday") return { from: addDays(day, -1), to: addDays(day, -1) };
	if (input.period === "week") return { from: weekStart(day), to: addDays(weekStart(day), 6) };
	return { from: day, to: day };
}

const label = (s: StaffSession, r: { from: string; to: string }): string =>
	r.from === r.to
		? dateLabel(s.copy, r.from)
		: `${dateLabel(s.copy, r.from)} – ${dateLabel(s.copy, r.to)}`;

export function activityTool(session: StaffSession) {
	const Out = z.object({
		status: z.literal("ok"),
		range: z.object({ from: z.string(), to: z.string() }),
		total: z.number(),
		counts: z.array(z.object({ kind: z.string(), verb: z.string(), count: z.number() })),
		recent: z.array(
			z.object({
				at: z.string(),
				kind: z.string(),
				verb: z.string(),
				actor: z.string(),
				label: z.string().nullable(),
				subjectId: z.string().nullable(),
			}),
		),
	});
	return staffTool(session, {
		key: "activity",
		phase: "read",
		description:
			'What happened in a period, from the audit log and the change feed: new, moved and cancelled appointments, new clients, payments, leave, requests, and who did what. Use for "ce s-a întâmplat azi?".',
		inputSchema: z.object(PeriodInput).strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const range = rangeOf(s, input);
			const found = await s.port.activity({ ...range, limit: 200 });
			if (!found.ok) return refuse(found.reason);
			const tally = new Map<string, number>();
			for (const e of found.value)
				tally.set(`${e.kind}|${e.verb}`, (tally.get(`${e.kind}|${e.verb}`) ?? 0) + 1);
			const recent = [...found.value].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 15);
			const rows: Array<CardRow> = recent.map((e) => ({
				title: `${s.copy.card.activityKind[e.kind]} ${s.copy.card.verb(e.verb)}${e.label ? ` · ${e.label}` : ""}`,
				subtitle: `${e.actor} · ${clock(Number(e.at.slice(11, 13)) * 60 + Number(e.at.slice(14, 16)))}`,
				...(s.links?.audit === undefined ? {} : { href: s.links.audit() }),
			}));
			return {
				ok: true,
				subjects: [],
				cards: [
					{
						kind: "list",
						title: s.copy.card.activity(label(s, range)),
						empty: s.copy.card.noActivity,
						rows,
					},
				],
				output: {
					status: "ok",
					range,
					total: found.value.length,
					counts: [...tally.entries()].map(([key, count]) => {
						const [kind = "", verb = ""] = key.split("|");
						return { kind, verb, count };
					}),
					recent: recent.map((e) => ({
						...e,
						actor: fence(e.actor, 80),
						label: fenceOrNull(e.label),
					})),
				},
			};
		},
	});
}

export function newBookingsTool(session: StaffSession) {
	const Out = z.object({
		status: z.literal("ok"),
		range: z.object({ from: z.string(), to: z.string() }),
		bySource: z.object({ form: z.number(), chat: z.number(), staff: z.number() }),
		bookings: z.array(
			z.object({
				id: z.string(),
				createdAt: z.string(),
				date: z.string(),
				time: z.string(),
				client: z.string(),
				service: z.string(),
				source: z.string(),
				status: z.string(),
			}),
		),
	});
	return staffTool(session, {
		key: "newBookings",
		phase: "read",
		description:
			"Bookings made in a period and where each came from: the website form, the visitor-facing AI chat, or the team.",
		inputSchema: z.object(PeriodInput).strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const range = rangeOf(s, input);
			const found = await s.port.bookings({ ...range, limit: 100 });
			if (!found.ok) return refuse(found.reason);
			const bySource = { form: 0, chat: 0, staff: 0 };
			for (const b of found.value) bySource[b.source] += 1;
			const shown = found.value.slice(0, 30);
			return {
				ok: true,
				subjects: shown.map((b) => b.id),
				cards: [
					{
						kind: "list",
						title: s.copy.card.bookings(label(s, range)),
						empty: s.copy.card.noBookings,
						rows: shown.map((b) => ({
							title: `${b.clientName} · ${dateLabel(s.copy, b.date)} ${clock(b.startMin)}`,
							subtitle: b.serviceName,
							badge: s.copy.card.source[b.source],
							tone: b.source === "staff" ? "neutral" : "warn",
							...(s.links === undefined ? {} : { href: s.links.appointment(b.id, b.date) }),
						})),
					},
				],
				output: {
					status: "ok",
					range,
					bySource,
					bookings: shown.map((b) => ({
						id: b.id,
						createdAt: b.createdAt,
						date: b.date,
						time: clock(b.startMin),
						client: fence(b.clientName),
						service: fence(b.serviceName),
						source: b.source,
						status: b.status,
					})),
				},
			};
		},
	});
}

/** Anything that could identify a visitor, removed from a sample before it is shown. */
export function scrub(text: string): string {
	return text
		.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail]")
		.replace(/\+?\d[\d\s().-]{6,}\d/g, "[număr]")
		.replace(/https?:\/\/\S+/g, (url) => url.replace(/\?.*$/, ""));
}

export function siteIssuesTool(session: StaffSession) {
	const Out = z.object({
		status: z.literal("ok"),
		range: z.object({ from: z.string(), to: z.string() }),
		total: z.number(),
		issues: z.array(
			z.object({
				kind: z.string(),
				site: z.string(),
				count: z.number(),
				firstSeen: z.string(),
				lastSeen: z.string(),
				sample: z.string().optional(),
			}),
		),
	});
	return staffTool(session, {
		key: "siteIssues",
		phase: "read",
		description:
			"Problems visitors met on the sites in a period, aggregated by kind: server errors, failed bookings, the error page, chat failures, scheduling unavailable, and problems visitors reported. Counts and times only, no personal data. For owners and administrators.",
		inputSchema: z
			.object({ period: z.enum(["today", "yesterday", "week", "month"]).default("week") })
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			if (s.issues === undefined) return refuse("unavailable");
			const day = today(s);
			const range =
				input.period === "month"
					? { from: addDays(day, -29), to: day }
					: rangeOf(s, { period: input.period });
			const found = await s.issues.issues(range);
			if (!found.ok) return refuse(found.reason);
			const sorted = [...found.value].sort((a, b) => b.count - a.count).slice(0, 30);
			return {
				ok: true,
				subjects: [],
				cards: [
					{
						kind: "list",
						title: s.copy.card.issues(label(s, range)),
						empty: s.copy.card.noIssues,
						rows: sorted.map((i) => ({
							title: `${s.copy.card.issueKind[i.kind]} · ${i.site}`,
							subtitle: s.copy.card.issueLine({
								count: i.count,
								first: i.firstSeen.slice(0, 16).replace("T", " "),
								last: i.lastSeen.slice(0, 16).replace("T", " "),
							}),
							badge: String(i.count),
							tone: i.kind === "http_5xx" || i.kind === "booking_failed" ? "bad" : "warn",
							...(s.links?.issues === undefined ? {} : { href: s.links.issues() }),
						})),
					},
				],
				output: {
					status: "ok",
					range,
					total: sorted.reduce((sum, i) => sum + i.count, 0),
					issues: sorted.map((i) => ({
						...i,
						...(i.sample === undefined ? {} : { sample: fence(scrub(i.sample), 200) }),
					})),
				},
			};
		},
	});
}

export function requestReplyTool(session: StaffSession) {
	const Out = z.object({
		status: z.literal("ok"),
		id: z.string(),
		channel: z.enum(["form", "chat"]),
		summary: z.string().nullable(),
		excerpt: z.string().nullable(),
		draft: z.string(),
	});
	return staffTool(session, {
		key: "requestReply",
		phase: "read",
		description:
			"One website request in full: its channel (form or AI chat), what the AI summarised and the conversation excerpt the visitor agreed to share (fenced as record data), and a draft reply in the clinic's words. Sends nothing.",
		inputSchema: z.object({ requestId: IdSchema }).strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const found = await s.port.webRequest(input.requestId);
			if (!found.ok) return { ...refuse(found.reason), subjects: [input.requestId] };
			const r = found.value;
			s.taint.stranger = true;
			const draft = s.copy.requestReply({ appName: s.principal.appName });
			return {
				ok: true,
				subjects: [r.id],
				cards: [
					{
						kind: "client",
						title: `${s.copy.card.channel[r.channel]} · ${r.name}`,
						lines: [
							{ label: s.copy.label.phone, value: r.phone },
							{ label: s.copy.label.service, value: r.service },
							{ label: s.copy.label.channel, value: s.copy.card.channel[r.channel] },
							...(r.summary === undefined
								? []
								: [{ label: s.copy.label.reason, value: r.summary }]),
							{ label: s.copy.label.reminder, value: draft },
						],
						note: r.excerpt ?? r.message,
						...(s.links?.request === undefined ? {} : { href: s.links.request(r.id) }),
					},
				],
				output: {
					status: "ok",
					id: r.id,
					channel: r.channel,
					summary: fenceOrNull(r.summary),
					excerpt: fenceOrNull(r.excerpt ?? r.message),
					draft,
				},
			};
		},
	});
}
