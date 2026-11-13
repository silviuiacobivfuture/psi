import { z } from "zod";
import { clock, clockRange, dateLabel } from "./format";
import { DateSchema, IdSchema, type Resource } from "./model";
import { NeedsConfirmationSchema, propose } from "./propose";
import { resolveResource, resolveService } from "./resolve";
import { type StaffSession, staffTool, type ToolRun } from "./session";

const TimeSchema = z
	.string()
	.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
	.describe("HH:MM, 24-hour");
const Candidates = z.array(z.object({ id: z.string(), name: z.string() }));
const Ambiguous = z.object({
	status: z.literal("ambiguous"),
	candidates: Candidates,
});
const NoMatch = z.object({ status: z.literal("none") });
const Out = z.union([NeedsConfirmationSchema, Ambiguous, NoMatch]);
type Out = z.infer<typeof Out>;

const minutesOf = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const refuse = (reason: "forbidden" | "not_found" | "conflict" | "invalid" | "unavailable") =>
	({ ok: false, reason }) as const;

type Resolution = { ok: true; resources: Array<Resource> } | { ok: false; run: ToolRun<Out> };

/** Names or ids to resources; one that does not match, or matches several, ends the call with a question. */
async function resolveAll(s: StaffSession, refs: ReadonlyArray<string>): Promise<Resolution> {
	const resources: Array<Resource> = [];
	for (const ref of refs) {
		const found = await resolveResource(s, ref);
		if (!found.ok) return { ok: false, run: refuse(found.reason) };
		if (found.value.kind === "none")
			return {
				ok: false,
				run: { ok: true, subjects: [], output: { status: "none" } },
			};
		if (found.value.kind === "many") {
			return {
				ok: false,
				run: {
					ok: true,
					subjects: [],
					output: {
						status: "ambiguous",
						candidates: found.value.candidates.map((r) => ({
							id: r.id,
							name: r.name,
						})),
					},
				},
			};
		}
		resources.push(found.value.value);
	}
	return { ok: true, resources };
}

const where = (resources: ReadonlyArray<Resource>): string =>
	resources.map((r) => r.name).join(" · ");

export function createAppointmentTool(session: StaffSession) {
	return staffTool(session, {
		key: "createAppointment",
		phase: "propose",
		description:
			"Prepare a new appointment for a client: service (name or id), day, time and who/where (therapist, room, device). It books nothing; the person confirms in a card. Check free times first when unsure.",
		inputSchema: z
			.object({
				clientId: IdSchema,
				service: z.string().trim().min(1).max(120),
				date: DateSchema,
				time: TimeSchema,
				resources: z.array(z.string().trim().min(1).max(120)).min(1).max(4),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<Out>> {
			const [client, service] = await Promise.all([
				s.port.clientSummary(input.clientId),
				resolveService(s, input.service),
			]);
			if (!client.ok) return { ...refuse(client.reason), subjects: [input.clientId] };
			if (!service.ok) return refuse(service.reason);
			if (service.value.kind === "none")
				return { ok: true, subjects: [], output: { status: "none" } };
			if (service.value.kind === "many") {
				return {
					ok: true,
					subjects: [],
					output: {
						status: "ambiguous",
						candidates: service.value.candidates.map((x) => ({
							id: x.id,
							name: x.name,
						})),
					},
				};
			}
			const resolved = await resolveAll(s, input.resources);
			if (!resolved.ok) return resolved.run;
			const startMin = minutesOf(input.time);
			const durationMin = service.value.value.durationMin;
			const resourceIds = resolved.resources.map((r) => r.id);
			const check = await s.port.checkSlot({
				date: input.date,
				startMin,
				durationMin,
				resourceIds,
			});
			if (!check.ok) return refuse(check.reason);
			if (!check.value.free) return { ...refuse("conflict"), subjects: [input.clientId] };
			return propose(
				s,
				{
					kind: "create_appointment",
					clientId: input.clientId,
					serviceId: service.value.value.id,
					date: input.date,
					startMin,
					durationMin,
					resourceIds,
				},
				{
					title: s.copy.proposal.create,
					destructive: false,
					lines: [
						{
							label: s.copy.label.client,
							value: client.value.name,
							free: true,
						},
						{ label: s.copy.label.service, value: service.value.value.name },
						{
							label: s.copy.label.when,
							value: `${dateLabel(s.copy, input.date)} · ${clockRange(startMin, durationMin)}`,
						},
						{ label: s.copy.label.where, value: where(resolved.resources) },
					],
				},
			);
		},
	});
}

export function moveAppointmentTool(session: StaffSession) {
	return staffTool(session, {
		key: "moveAppointment",
		phase: "propose",
		description:
			"Prepare moving an appointment to another day, time or place (defaults to the appointment on the open screen). It moves nothing; the person confirms in a card. The client is never changed by a move.",
		inputSchema: z
			.object({
				appointmentId: IdSchema.optional(),
				date: DateSchema,
				time: TimeSchema,
				resources: z.array(z.string().trim().min(1).max(120)).min(1).max(4).optional(),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<Out>> {
			const id = input.appointmentId ?? s.page?.appointmentId;
			if (id === undefined) return refuse("invalid");
			const found = await s.port.appointment(id);
			if (!found.ok) return { ...refuse(found.reason), subjects: [id] };
			const a = found.value;
			const resolved =
				input.resources === undefined ? undefined : await resolveAll(s, input.resources);
			if (resolved !== undefined && !resolved.ok) return resolved.run;
			const resourceIds =
				resolved === undefined ? a.resourceIds : resolved.resources.map((r) => r.id);
			const startMin = minutesOf(input.time);
			const check = await s.port.checkSlot({
				date: input.date,
				startMin,
				durationMin: a.durationMin,
				resourceIds,
				ignoreAppointmentId: a.id,
			});
			if (!check.ok) return { ...refuse(check.reason), subjects: [id] };
			if (!check.value.free) return { ...refuse("conflict"), subjects: [id] };
			const all = await s.port.resources();
			const names =
				resolved === undefined
					? resourceIds
							.map((rid) => (all.ok ? all.value.find((r) => r.id === rid)?.name : undefined) ?? rid)
							.join(" · ")
					: where(resolved.resources);
			return propose(
				s,
				{
					kind: "move_appointment",
					id: a.id,
					expectedVersion: a.version,
					date: input.date,
					startMin,
					durationMin: a.durationMin,
					resourceIds,
				},
				{
					title: s.copy.proposal.move,
					destructive: false,
					lines: [
						{
							label: s.copy.label.client,
							value: a.clientName ?? a.title ?? "",
							free: true,
						},
						{
							label: s.copy.label.wasWhen,
							value: `${dateLabel(s.copy, a.date)} · ${clockRange(a.startMin, a.durationMin)}`,
						},
						{
							label: s.copy.label.when,
							value: `${dateLabel(s.copy, input.date)} · ${clockRange(startMin, a.durationMin)}`,
						},
						{ label: s.copy.label.where, value: names },
					],
				},
			);
		},
	});
}

export function cancelAppointmentTool(session: StaffSession) {
	return staffTool(session, {
		key: "cancelAppointment",
		phase: "propose",
		description:
			"Prepare cancelling an appointment (defaults to the one on the open screen). It cancels nothing; the person confirms in a card.",
		inputSchema: z.object({ appointmentId: IdSchema.optional() }).strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<Out>> {
			const id = input.appointmentId ?? s.page?.appointmentId;
			if (id === undefined) return refuse("invalid");
			const found = await s.port.appointment(id);
			if (!found.ok) return { ...refuse(found.reason), subjects: [id] };
			const a = found.value;
			if (a.status === "cancelled") return { ...refuse("conflict"), subjects: [id] };
			return propose(
				s,
				{ kind: "cancel_appointment", id: a.id, expectedVersion: a.version },
				{
					title: s.copy.proposal.cancel,
					destructive: true,
					lines: [
						{
							label: s.copy.label.client,
							value: a.clientName ?? a.title ?? "",
							free: true,
						},
						{
							label: s.copy.label.when,
							value: `${dateLabel(s.copy, a.date)} · ${clockRange(a.startMin, a.durationMin)}`,
						},
					],
				},
			);
		},
	});
}

export function markAttendanceTool(session: StaffSession) {
	return staffTool(session, {
		key: "markAttendance",
		phase: "propose",
		description:
			"Prepare marking an appointment as attended or no-show (defaults to the one on the open screen). The person confirms in a card.",
		inputSchema: z
			.object({
				appointmentId: IdSchema.optional(),
				status: z.enum(["attended", "no-show"]),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<Out>> {
			const id = input.appointmentId ?? s.page?.appointmentId;
			if (id === undefined) return refuse("invalid");
			const found = await s.port.appointment(id);
			if (!found.ok) return { ...refuse(found.reason), subjects: [id] };
			const a = found.value;
			if (a.status === "cancelled") return { ...refuse("conflict"), subjects: [id] };
			return propose(
				s,
				{
					kind: "mark_attendance",
					id: a.id,
					expectedVersion: a.version,
					status: input.status,
				},
				{
					title: s.copy.proposal.attendance(input.status),
					destructive: false,
					lines: [
						{
							label: s.copy.label.client,
							value: a.clientName ?? a.title ?? "",
							free: true,
						},
						{
							label: s.copy.label.when,
							value: `${dateLabel(s.copy, a.date)} · ${clock(a.startMin)}`,
						},
					],
				},
			);
		},
	});
}
