import { z } from "zod";
import { fence } from "./fence";
import { clock, dateLabel, money } from "./format";
import { DateSchema, IdSchema, LEAVE_KINDS, PAYMENT_METHODS, REMINDER_CHANNELS } from "./model";
import { NeedsConfirmationSchema, propose } from "./propose";
import { type StaffSession, staffTool, type ToolRun } from "./session";

const Candidates = z.array(z.object({ id: z.string(), name: z.string() }));
const Ambiguous = z.object({
	status: z.literal("ambiguous"),
	candidates: Candidates,
});
const NoMatch = z.object({ status: z.literal("none") });
const Out = z.union([NeedsConfirmationSchema, Ambiguous, NoMatch]);
type Out = z.infer<typeof Out>;

const refuse = (reason: "forbidden" | "not_found" | "conflict" | "invalid" | "unavailable") =>
	({ ok: false, reason }) as const;

export function recordPaymentTool(session: StaffSession) {
	return staffTool(session, {
		key: "recordPayment",
		phase: "propose",
		description:
			"Prepare recording a payment against a client's package (amount in lei; defaults to the client on the open screen; the package is chosen automatically when exactly one has a balance due). The person confirms in a card.",
		inputSchema: z
			.object({
				clientId: IdSchema.optional(),
				packageId: IdSchema.optional(),
				amount: z.number().positive().max(100_000),
				method: z.enum(PAYMENT_METHODS),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<Out>> {
			const clientId = input.clientId ?? s.page?.clientId;
			if (clientId === undefined) return refuse("invalid");
			const amountBani = Math.round(input.amount * 100);
			if (Math.abs(amountBani - input.amount * 100) > 1e-6)
				return { ...refuse("invalid"), subjects: [clientId] };
			const found = await s.port.packages(clientId);
			if (!found.ok) return { ...refuse(found.reason), subjects: [clientId] };
			const owing = found.value.filter((p) => p.totalBani > p.paidBani);
			const chosen =
				input.packageId === undefined
					? owing.length === 1
						? owing[0]
						: undefined
					: found.value.find((p) => p.id === input.packageId);
			if (chosen === undefined) {
				return owing.length > 1 && input.packageId === undefined
					? {
							ok: true,
							subjects: [clientId],
							output: {
								status: "ambiguous",
								candidates: owing.map((p) => ({
									id: p.id,
									name: fence(p.name),
								})),
							},
						}
					: { ok: true, subjects: [clientId], output: { status: "none" } };
			}
			if (amountBani > chosen.totalBani - chosen.paidBani)
				return { ...refuse("invalid"), subjects: [clientId] };
			return propose(
				s,
				{
					kind: "record_payment",
					clientId,
					packageId: chosen.id,
					expectedVersion: chosen.version,
					amountBani,
					method: input.method,
				},
				{
					title: s.copy.proposal.payment,
					destructive: false,
					lines: [
						{ label: s.copy.label.package, value: chosen.name, free: true },
						{ label: s.copy.label.amount, value: money(s.copy, amountBani) },
						{ label: s.copy.label.method, value: s.copy.method[input.method] },
						{
							label: s.copy.label.due,
							value: money(s.copy, chosen.totalBani - chosen.paidBani - amountBani),
						},
					],
				},
			);
		},
	});
}

export function requestLeaveTool(session: StaffSession) {
	return staffTool(session, {
		key: "requestLeave",
		phase: "propose",
		description:
			"Prepare a leave request for the person (or for another person when their role allows it): annual or medical leave over a range of days. The person confirms in a card.",
		inputSchema: z
			.object({
				personId: IdSchema.optional(),
				from: DateSchema,
				to: DateSchema,
				kind: z.enum(LEAVE_KINDS),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<Out>> {
			const personId = input.personId ?? s.principal.personId;
			if (personId === undefined || input.to < input.from) return refuse("invalid");
			return propose(
				s,
				{
					kind: "request_leave",
					personId,
					from: input.from,
					to: input.to,
					leaveKind: input.kind,
				},
				{
					title: s.copy.proposal.leave,
					destructive: false,
					lines: [
						{ label: s.copy.label.kind, value: s.copy.leaveKind[input.kind] },
						{ label: s.copy.label.from, value: dateLabel(s.copy, input.from) },
						{ label: s.copy.label.to, value: dateLabel(s.copy, input.to) },
					],
				},
			);
		},
	});
}

export function markRequestHandledTool(session: StaffSession) {
	return staffTool(session, {
		key: "markRequestHandled",
		phase: "propose",
		description: "Prepare marking a website request as handled. The person confirms in a card.",
		inputSchema: z.object({ requestId: IdSchema }).strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<Out>> {
			const found = await s.port.webRequest(input.requestId);
			if (!found.ok) return { ...refuse(found.reason), subjects: [input.requestId] };
			const r = found.value;
			if (r.handled) return { ...refuse("conflict"), subjects: [r.id] };
			return propose(
				s,
				{ kind: "handle_request", id: r.id, expectedVersion: r.version },
				{
					title: s.copy.proposal.handle,
					destructive: false,
					lines: [
						{ label: s.copy.label.client, value: r.name, free: true },
						{ label: s.copy.label.service, value: r.service, free: true },
					],
				},
			);
		},
	});
}

export function sendRemindersTool(session: StaffSession) {
	return staffTool(session, {
		key: "sendReminders",
		phase: "propose",
		description:
			"Prepare sending the reminder for chosen appointments of a day by e-mail or WhatsApp (a prepared link). The text is the clinic's own template and cannot be changed here. One confirmation covers all of them.",
		inputSchema: z
			.object({
				date: DateSchema,
				appointmentIds: z.array(IdSchema).min(1).max(25),
				channel: z.enum(REMINDER_CHANNELS),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<Out>> {
			const targets = await s.port.reminderTargets(input.date);
			if (!targets.ok) return refuse(targets.reason);
			const chosen = targets.value.filter(
				(t) =>
					input.appointmentIds.includes(t.appointmentId) &&
					(input.channel === "email" ? t.email !== null : t.phone !== null),
			);
			if (chosen.length === 0) return { ok: true, subjects: [], output: { status: "none" } };
			const items = chosen.map((t) => ({
				appointmentId: t.appointmentId,
				expectedVersion: t.version,
				channel: input.channel,
				name: t.clientName,
				text: s.copy.reminderText({
					name: t.clientName,
					when: `${dateLabel(s.copy, t.date)}, ${clock(t.startMin)}`,
					where: t.resourceName,
					appName: s.principal.appName,
					channel: input.channel,
				}),
			}));
			return propose(
				s,
				{ kind: "send_reminders", items },
				{
					title: s.copy.proposal.reminders(items.length),
					destructive: false,
					lines: [
						{
							label: s.copy.label.channel,
							value: s.copy.channel[input.channel],
						},
						{
							label: s.copy.label.recipients,
							value: items.map((i) => i.name).join(", "),
							free: true,
						},
						{
							label: s.copy.label.reminder,
							value: items[0]?.text ?? "",
							free: true,
						},
					],
				},
			);
		},
	});
}
