import { z } from "zod";
import { defaultService } from "./booking-defaults";
import { clock, clockRange, dateLabel } from "./format";
import { DateSchema, IdSchema, type Resource } from "./model";
import { NEW_CLIENT } from "./proposals";
import { NeedsConfirmationSchema, propose } from "./propose";
import { resolveResource, resolveService } from "./resolve";
import { type StaffSession, staffTool, type ToolRun } from "./session";
import { createClientStep, NewClientFields, newClientLines, sameName } from "./tools-clients";

const TimeSchema = z
	.string()
	.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
	.describe("HH:MM, 24-hour");
const Candidates = z.array(z.object({ id: z.string(), name: z.string() }));
const Ambiguous = z.object({
	status: z.literal("ambiguous"),
	/** What is being chosen ("Serviciu"): the choices card asks it, instead of "several matches". */
	what: z.string().optional(),
	candidates: Candidates,
});
const NoMatch = z.object({ status: z.literal("none") });
/** What the request still lacks, named, so the assistant asks for exactly that and nothing is prepared half-way. */
const Missing = z.object({
	status: z.literal("missing"),
	missing: z.array(z.string()),
});
const Out = z.union([NeedsConfirmationSchema, Ambiguous, NoMatch, Missing]);
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
			"Prepare a new appointment for a client: service (name or id), day, time and who/where (therapist, room, device). It books nothing; the person confirms in a card. Check free times first when unsure. For a person who is NOT a client yet (a search found nobody), pass `newClient` (their name and whatever else was said) instead of clientId: ONE card adds the client and books them, so do not call staffCreateClient first.",
		inputSchema: z
			.object({
				clientId: IdSchema.optional(),
				newClient: z
					.object({ ...NewClientFields, anotherPerson: z.boolean().optional() })
					.strict()
					.optional(),
				service: z.string().trim().min(1).max(120).optional(),
				date: DateSchema.optional(),
				time: TimeSchema.optional(),
				resources: z.array(z.string().trim().min(1).max(120)).min(1).max(4).optional(),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<Out>> {
			// What is still missing is named, whole, before anything is prepared: never a bare "invalid".
			const missing: Array<"client" | "date" | "time" | "resources"> = [];
			if (input.clientId === undefined && input.newClient === undefined) missing.push("client");
			if (input.date === undefined) missing.push("date");
			if (input.time === undefined) missing.push("time");
			if (input.resources === undefined) missing.push("resources");
			if (input.clientId !== undefined && input.newClient !== undefined) missing.push("client");
			if (
				missing.length > 0 ||
				input.date === undefined ||
				input.time === undefined ||
				input.resources === undefined
			)
				return { ok: true, subjects: [], output: { status: "missing", missing } };
			let clientId = input.clientId;
			let existing = clientId === undefined ? undefined : await s.port.clientSummary(clientId);
			if (
				clientId !== undefined &&
				existing !== undefined &&
				!existing.ok &&
				existing.reason === "not_found"
			) {
				// A name where an id belongs: find that client, or say the client does not exist yet.
				const named = await s.port.findClients({
					query: clientId,
					includeArchived: false,
					limit: 5,
				});
				const hits = named.ok ? named.value : [];
				const [first] = hits;
				if (hits.length === 1 && first !== undefined) {
					clientId = first.id;
					existing = await s.port.clientSummary(first.id);
				} else if (hits.length > 1)
					return {
						ok: true,
						subjects: hits.map((h) => h.id),
						output: {
							status: "ambiguous",
							candidates: hits.map((h) => ({ id: h.id, name: h.name })),
						},
					};
				else
					return {
						ok: true,
						subjects: [],
						output: { status: "missing", missing: ["client_not_found"] },
					};
			}
			if (existing !== undefined && !existing.ok)
				return { ...refuse(existing.reason), subjects: [clientId ?? ""] };
			const resolved = await resolveAll(s, input.resources);
			if (!resolved.ok) return resolved.run;
			const chosen =
				input.service === undefined
					? await defaultService(s, resolved.resources.find((r) => r.kind === "person")?.id)
					: undefined;
			if (chosen?.kind === "refused") return refuse(chosen.reason);
			if (chosen?.kind === "ask")
				return {
					ok: true,
					subjects: [],
					output: {
						status: "ambiguous",
						what: s.copy.label.service,
						candidates: chosen.candidates.map((c) => ({ id: c.id, name: c.name })),
					},
				};
			const service =
				chosen?.kind === "one"
					? ({ ok: true, value: { kind: "one", value: chosen.service } } as const)
					: await resolveService(s, input.service ?? "");
			if (input.newClient !== undefined && input.newClient.anotherPerson !== true) {
				const twins = await sameName(s, input.newClient.name);
				if (twins.length > 0)
					return {
						ok: true,
						subjects: twins.map((t) => t.id),
						output: { status: "ambiguous", candidates: twins },
					};
			}
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
			if (!check.value.free)
				return {
					...refuse("conflict"),
					subjects: clientId === undefined ? [] : [clientId],
				};
			const book = {
				kind: "create_appointment" as const,
				clientId: clientId ?? NEW_CLIENT,
				serviceId: service.value.value.id,
				date: input.date,
				startMin,
				durationMin,
				resourceIds,
			};
			const whoLines =
				input.newClient === undefined
					? [
							{
								label: s.copy.label.client,
								value: existing?.ok === true ? existing.value.name : "",
								free: true,
							},
						]
					: newClientLines(s, input.newClient);
			return propose(
				s,
				input.newClient === undefined
					? book
					: {
							kind: "batch",
							steps: [createClientStep(s, input.newClient), book],
						},
				{
					title:
						input.newClient === undefined
							? s.copy.proposal.create
							: s.copy.proposal.createClientAndBook,
					destructive: false,
					lines: [
						...whoLines,
						{
							label: s.copy.label.service,
							value:
								chosen?.kind === "one"
									? `${service.value.value.name} · ${s.copy.card.serviceWhy[chosen.why]}`
									: service.value.value.name,
						},
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
					before: {
						date: a.date,
						startMin: a.startMin,
						resourceIds: a.resourceIds,
					},
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
