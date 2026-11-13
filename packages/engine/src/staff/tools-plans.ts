import { z } from "zod";
import { addDays, clock, clockRange, dateLabel, money, weekStart } from "./format";
import { DateSchema, IdSchema, LEAVE_KINDS, REMINDER_CHANNELS } from "./model";
import { ANY_VERSION, type Step } from "./proposals";
import { NeedsConfirmationSchema, type ProposalLine, propose } from "./propose";
import { resolveResource } from "./resolve";
import type { StaffSession } from "./session";
import { staffTool, type ToolRun } from "./session";
import { Ambiguous, NoMatch, refuse } from "./tools-shared";

const Out = z.union([NeedsConfirmationSchema, Ambiguous, NoMatch]);
type Out = z.infer<typeof Out>;

const none: ToolRun<Out> = { ok: true, subjects: [], output: { status: "none" } };

export function paymentRemindersTool(session: StaffSession) {
	return staffTool(session, {
		key: "paymentReminders",
		phase: "propose",
		description:
			"Prepare a payment notice for clients who owe a balance (ids from the attention tool), by e-mail or WhatsApp. The text is the clinic's template. One confirmation covers the whole batch.",
		inputSchema: z
			.object({
				clientIds: z.array(IdSchema).min(1).max(30),
				channel: z.enum(REMINDER_CHANNELS),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<Out>> {
			const day = new Date(s.now()).toISOString().slice(0, 10);
			const found = await s.port.attention({ from: day, to: addDays(day, 31), lowAt: -1 });
			if (!found.ok) return refuse(found.reason);
			const chosen = found.value.filter(
				(a) =>
					input.clientIds.includes(a.clientId) &&
					a.dueBani > 0 &&
					(input.channel === "email" ? a.canEmail : a.canWhatsapp),
			);
			if (chosen.length === 0) return none;
			const items = chosen.map((a) => ({
				about: "payment" as const,
				clientId: a.clientId,
				expectedVersion: ANY_VERSION,
				channel: input.channel,
				name: a.clientName,
				text: s.copy.paymentText({
					name: a.clientName,
					due: money(s.copy, a.dueBani),
					appName: s.principal.appName,
				}),
			}));
			return propose(
				s,
				{ kind: "send_reminders", items },
				{
					title: s.copy.proposal.paymentReminders(items.length),
					destructive: false,
					lines: [
						{ label: s.copy.label.channel, value: s.copy.channel[input.channel] },
						{
							label: s.copy.label.recipients,
							value: items.map((i) => i.name).join(", "),
							free: true,
						},
						{ label: s.copy.label.reminder, value: items[0]?.text ?? "", free: true },
					],
				},
			);
		},
	});
}

export function copyWeekTool(session: StaffSession) {
	return staffTool(session, {
		key: "copyWeek",
		phase: "propose",
		description:
			'Prepare copying one week\'s appointments to another ("fă programul pentru săptămâna viitoare ca săptămâna asta"). Give any day of the source week and any day of the target week (use resolveDate). It shows what cannot be copied (a taken slot, someone on leave) and creates nothing until the person confirms once.',
		inputSchema: z.object({ fromDate: DateSchema, toDate: DateSchema }).strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<Out>> {
			const sourceStart = weekStart(input.fromDate);
			const targetStart = weekStart(input.toDate);
			if (sourceStart === targetStart) return refuse("invalid");
			const offset = Math.round(
				(Date.parse(`${targetStart}T00:00:00Z`) - Date.parse(`${sourceStart}T00:00:00Z`)) /
					86_400_000,
			);
			const [source, resources, roster] = await Promise.all([
				s.port.agenda({ from: sourceStart, to: addDays(sourceStart, 6) }),
				s.port.resources(),
				s.port.roster({ from: targetStart, to: addDays(targetStart, 6) }),
			]);
			if (!source.ok) return refuse(source.reason);
			if (!resources.ok) return refuse(resources.reason);
			if (!roster.ok) return refuse(roster.reason);
			const persons = new Set(resources.value.filter((r) => r.kind === "person").map((r) => r.id));
			const away = new Set(
				roster.value
					.filter((r) => r.kind === "leave" || r.kind === "medical")
					.map((r) => `${r.personId}|${r.date}`),
			);
			const copies = source.value
				.filter((a) => a.status !== "cancelled" && a.clientId !== null)
				.slice(0, 60);
			const checked = await Promise.all(
				copies.map(async (a) => {
					const date = addDays(a.date, offset);
					if (a.resourceIds.some((id) => persons.has(id) && away.has(`${id}|${date}`))) {
						return { a, date, verdict: "leave" as const };
					}
					const check = await s.port.checkSlot({
						date,
						startMin: a.startMin,
						durationMin: a.durationMin,
						resourceIds: a.resourceIds,
					});
					return {
						a,
						date,
						verdict: check.ok && check.value.free ? ("ok" as const) : ("busy" as const),
					};
				}),
			);
			const ok = checked.filter((c) => c.verdict === "ok");
			if (ok.length === 0) return none;
			const steps: Array<Step> = ok.flatMap(({ a, date }) =>
				a.clientId === null
					? []
					: [
							{
								kind: "create_appointment" as const,
								clientId: a.clientId,
								serviceId: a.serviceId,
								date,
								startMin: a.startMin,
								durationMin: a.durationMin,
								resourceIds: a.resourceIds,
							},
						],
			);
			const conflicts = checked.filter((c) => c.verdict !== "ok");
			const lines: Array<ProposalLine> = [
				{ label: s.copy.label.from, value: `${dateLabel(s.copy, sourceStart)}` },
				{ label: s.copy.label.to, value: `${dateLabel(s.copy, targetStart)}` },
				{ label: s.copy.label.toCreate, value: String(steps.length) },
				...conflicts.slice(0, 8).map((c) => ({
					label: s.copy.label.conflicts,
					free: true,
					value: `${c.a.clientName ?? ""} · ${dateLabel(s.copy, c.date)} ${clock(c.a.startMin)} — ${c.verdict === "leave" ? s.copy.card.conflictLeave : s.copy.card.conflictBusy}`,
				})),
			];
			return propose(
				s,
				{ kind: "batch", steps },
				{ title: s.copy.proposal.copyWeek(steps.length), destructive: false, lines },
			);
		},
	});
}

export function absenceTool(session: StaffSession) {
	return staffTool(session, {
		key: "absence",
		phase: "propose",
		description:
			'Prepare a day\'s absence of a therapist ("Irina e bolnavă mâine"): the leave in the roster, handing each of their appointments to a free colleague who works that day (same time, same room and device), the ones nobody can take listed for rescheduling, and a message to every client. ONE confirmation covers everything.',
		inputSchema: z
			.object({
				person: z.string().trim().min(1).max(120),
				date: DateSchema,
				kind: z.enum(LEAVE_KINDS).default("medical"),
				notify: z.boolean().default(true),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<Out>> {
			const resolved = await resolveResource(s, input.person);
			if (!resolved.ok) return refuse(resolved.reason);
			if (resolved.value.kind === "none") return none;
			if (resolved.value.kind === "many") {
				return {
					ok: true,
					subjects: [],
					output: {
						status: "ambiguous",
						candidates: resolved.value.candidates.map((r) => ({ id: r.id, name: r.name })),
					},
				};
			}
			const person = resolved.value.value;
			if (person.kind !== "person") return refuse("invalid");
			const [agenda, resources, roster, targets] = await Promise.all([
				s.port.agenda({ from: input.date, to: input.date, resourceId: person.id }),
				s.port.resources(),
				s.port.roster({ from: input.date, to: input.date }),
				input.notify
					? s.port.reminderTargets(input.date)
					: Promise.resolve({ ok: true as const, value: [] }),
			]);
			if (!agenda.ok) return refuse(agenda.reason);
			if (!resources.ok) return refuse(resources.reason);
			if (!roster.ok) return refuse(roster.reason);
			if (!targets.ok) return refuse(targets.reason);
			const working = new Set(
				roster.value
					.filter((r) => r.kind === "work" && r.personId !== person.id)
					.map((r) => r.personId),
			);
			const colleagues = resources.value.filter((r) => r.kind === "person" && working.has(r.id));
			const affected = agenda.value.filter(
				(a) => a.status === "confirmed" || a.status === "requested",
			);
			const taken: Array<{ id: string; from: number; to: number }> = [];
			const covered: Array<{ id: string; name: string; to: string; step: Step }> = [];
			const open: Array<{ id: string; name: string; when: string }> = [];
			for (const a of affected) {
				let handed = false;
				for (const colleague of colleagues) {
					if (
						taken.some(
							(t) =>
								t.id === colleague.id && t.from < a.startMin + a.durationMin && a.startMin < t.to,
						)
					)
						continue;
					const ids = a.resourceIds.map((id) => (id === person.id ? colleague.id : id));
					const free = await s.port.checkSlot({
						date: a.date,
						startMin: a.startMin,
						durationMin: a.durationMin,
						resourceIds: ids,
						ignoreAppointmentId: a.id,
					});
					if (!free.ok || !free.value.free) continue;
					taken.push({ id: colleague.id, from: a.startMin, to: a.startMin + a.durationMin });
					covered.push({
						id: a.id,
						name: a.clientName ?? a.title ?? "",
						to: colleague.name,
						step: {
							kind: "move_appointment",
							id: a.id,
							expectedVersion: a.version,
							date: a.date,
							startMin: a.startMin,
							durationMin: a.durationMin,
							resourceIds: ids,
							before: { date: a.date, startMin: a.startMin, resourceIds: a.resourceIds },
						},
					});
					handed = true;
					break;
				}
				if (!handed)
					open.push({
						id: a.id,
						name: a.clientName ?? a.title ?? "",
						when: clockRange(a.startMin, a.durationMin),
					});
			}
			const notices: Array<Extract<Step, { kind: "send_reminders" }>["items"][number]> = [];
			let unreachable = 0;
			for (const t of input.notify ? targets.value : []) {
				const move = covered.find((c) => c.id === t.appointmentId);
				const isOpen = open.some((o) => o.id === t.appointmentId);
				if (move === undefined && !isOpen) continue;
				const channel = t.email !== null ? "email" : t.phone !== null ? "whatsapp" : undefined;
				if (channel === undefined) {
					unreachable += 1;
					continue;
				}
				notices.push({
					about: "appointment",
					appointmentId: t.appointmentId,
					expectedVersion: ANY_VERSION,
					channel,
					name: t.clientName,
					text: s.copy.absenceText({
						name: t.clientName,
						when: `${dateLabel(s.copy, t.date)}, ${clock(t.startMin)}`,
						appName: s.principal.appName,
						...(move === undefined ? {} : { newWhere: move.to }),
					}),
				});
			}
			const steps: Array<Step> = [
				{
					kind: "request_leave",
					personId: person.id,
					from: input.date,
					to: input.date,
					leaveKind: input.kind,
				},
				...covered.map((c) => c.step),
				...(notices.length === 0 ? [] : [{ kind: "send_reminders" as const, items: notices }]),
			];
			const lines: Array<ProposalLine> = [
				{ label: s.copy.label.person, value: person.name },
				{ label: s.copy.label.kind, value: s.copy.leaveKind[input.kind] },
				{ label: s.copy.label.forDay, value: dateLabel(s.copy, input.date) },
				...covered.map((c) => ({
					label: s.copy.label.reassigned,
					free: true,
					value: `${c.name} → ${c.to}`,
				})),
				...open.map((o) => ({
					label: s.copy.label.toReschedule,
					free: true,
					value: `${o.name} · ${o.when}`,
				})),
				...(input.notify
					? [
							{
								label: s.copy.label.notices,
								value: `${notices.length}${unreachable > 0 ? ` (${unreachable} ${s.copy.card.noPhone}/${s.copy.card.noEmail})` : ""}`,
							},
						]
					: []),
			];
			return propose(
				s,
				{ kind: "batch", steps },
				{ title: s.copy.proposal.absence(person.name), destructive: false, lines },
			);
		},
	});
}
