import type { StaffCard, Tone } from "./events";
import { addDays, clock, dateLabel, money, todayIn } from "./format";
import type { Appointment } from "./model";
import type { StaffSession } from "./session";

type Section = Extract<StaffCard, { kind: "briefing" }>["sections"][number];

/** Appointments that share a resource at overlapping times (a double booking). */
export function overlaps(appointments: ReadonlyArray<Appointment>): number {
	let count = 0;
	const live = appointments.filter((a) => a.status !== "cancelled");
	for (let i = 0; i < live.length; i += 1) {
		for (let j = i + 1; j < live.length; j += 1) {
			const a = live[i];
			const b = live[j];
			if (a === undefined || b === undefined || a.date !== b.date) continue;
			const shared = a.resourceIds.some((id) => b.resourceIds.includes(id));
			if (
				shared &&
				a.startMin < b.startMin + b.durationMin &&
				b.startMin < a.startMin + a.durationMin
			)
				count += 1;
		}
	}
	return count;
}

const list = (names: ReadonlyArray<string>): string =>
	names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} +${names.length - 3}`;

/**
 * The day at a glance, built from the person's own reads in parallel and without a model: today's
 * load and double bookings, tomorrow's unconfirmed appointments, balances and packages running
 * out, new website requests, who is away. A part the person may not read is left out. Each item
 * carries the one-tap follow-up that sends its question as the next message.
 */
export async function buildBriefing(s: StaffSession): Promise<StaffCard> {
	const c = s.copy.briefing;
	const today = todayIn(s.timeZone, s.now());
	const tomorrow = addDays(today, 1);
	const [agenda, next, requests, roster, attention, resources] = await Promise.all([
		s.port.agenda({ from: today, to: today }),
		s.port.agenda({ from: tomorrow, to: tomorrow }),
		s.port.webRequests({ includeHandled: false }),
		s.port.roster({ from: today, to: today }),
		s.port.attention({ from: today, to: addDays(today, 30), lowAt: 2 }),
		s.port.resources(),
	]);
	const sections: Array<Section> = [];
	const section = (title: string, tone: Tone, items: Section["items"]): void => {
		if (items.length > 0) sections.push({ title, tone, items });
	};
	if (agenda.ok) {
		const live = agenda.value
			.filter((a) => a.status !== "cancelled")
			.sort((a, b) => a.startMin - b.startMin);
		const first = live[0];
		const clashes = overlaps(live);
		section(c.sections.today, clashes > 0 ? "warn" : "neutral", [
			{
				text:
					first === undefined
						? c.freeToday
						: c.today({ count: live.length, first: clock(first.startMin) }),
				ask: c.asks.agenda,
			},
			...(clashes > 0 ? [{ text: c.conflicts(clashes), ask: c.asks.agenda }] : []),
		]);
	}
	if (next.ok) {
		const unconfirmed = next.value.filter((a) => a.status === "requested");
		section(
			c.sections.tomorrow,
			"warn",
			unconfirmed.length === 0
				? []
				: [{ text: c.unconfirmed(unconfirmed.length), ask: c.asks.reminders }],
		);
	}
	if (attention.ok) {
		const owing = attention.value.filter((a) => a.dueBani > 0);
		const low = attention.value.filter((a) => a.sessionsLeft <= 2);
		section(c.sections.money, "warn", [
			...(owing.length === 0
				? []
				: [
						{
							text: `${c.unpaid(owing.length)} · ${money(
								s.copy,
								owing.reduce((sum, a) => sum + a.dueBani, 0),
							)}`,
							ask: c.asks.paymentReminders,
						},
					]),
			...(low.length === 0 ? [] : [{ text: c.lowPackages(low.length), ask: c.asks.attention }]),
		]);
	}
	if (requests.ok) {
		section(
			c.sections.requests,
			"warn",
			requests.value.length === 0
				? []
				: [{ text: c.requests(requests.value.length), ask: c.asks.requests }],
		);
	}
	if (roster.ok) {
		const names = roster.value
			.filter((r) => r.kind === "leave" || r.kind === "medical")
			.map(
				(r) =>
					(resources.ok ? resources.value.find((x) => x.id === r.personId)?.name : undefined) ??
					r.personId,
			);
		section(
			c.sections.team,
			"neutral",
			names.length === 0 ? [] : [{ text: c.leave(list(names)), ask: c.asks.roster }],
		);
	}
	return {
		kind: "briefing",
		title: c.title(dateLabel(s.copy, today)),
		sections,
		...(sections.length === 0 ? { clear: c.clear } : {}),
	};
}
