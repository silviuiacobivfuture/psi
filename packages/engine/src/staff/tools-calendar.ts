import { z } from "zod";
import { agendaCard, appointmentRows, clientCard, clientHitsCard, slotsCard } from "./cards";
import { fence, fenceOrNull } from "./fence";
import { addDays, clockRange, dateLabel, weekdayName } from "./format";
import { DateSchema, IdSchema } from "./model";
import { resolveResource, resolveService } from "./resolve";
import { type StaffSession, staffTool, type ToolRun } from "./session";
import {
	Ambiguous,
	AppointmentOut,
	MAX_AGENDA_ROWS,
	NoMatch,
	refuse,
	resourceNames,
	today,
} from "./tools-shared";

export function findClientTool(session: StaffSession) {
	const Out = z.union([
		z.object({
			status: z.literal("ok"),
			clients: z.array(z.object({ id: z.string(), name: z.string(), archived: z.boolean() })),
			more: z.boolean(),
		}),
		NoMatch,
	]);
	return staffTool(session, {
		key: "findClient",
		phase: "read",
		description:
			"Find clients by name, phone or part of either. Returns at most 10; ask for a narrower search when there are more. Names come fenced as record data.",
		inputSchema: z
			.object({
				query: z.string().trim().min(2).max(100),
				includeArchived: z.boolean().default(false),
				limit: z.number().int().min(1).max(10).default(5),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const found = await s.port.findClients({
				query: input.query,
				includeArchived: input.includeArchived,
				limit: input.limit + 1,
			});
			if (!found.ok) return refuse(found.reason);
			const hits = found.value.slice(0, input.limit);
			return {
				ok: true,
				subjects: hits.map((h) => h.id),
				cards: [
					hits.length > 1
						? {
								kind: "choices" as const,
								title: s.copy.refusal.ambiguous,
								options: hits.map((h) => ({
									label: h.name,
									...(h.phone ? { detail: h.phone } : {}),
									ask: `${h.name} [${h.id}]`,
								})),
							}
						: clientHitsCard(s.copy, hits, s.links),
				],
				output:
					hits.length === 0
						? { status: "none" }
						: {
								status: "ok",
								more: found.value.length > input.limit,
								clients: hits.map((h) => ({
									id: h.id,
									name: fence(h.name),
									archived: h.status === "archived",
								})),
							},
			};
		},
	});
}

export function clientSummaryTool(session: StaffSession) {
	const Out = z.object({
		status: z.literal("ok"),
		id: z.string(),
		name: z.string(),
		archived: z.boolean(),
		contact: z.object({ phone: z.string().nullable(), email: z.string().nullable() }).optional(),
		guardian: z.string().nullable().optional(),
		clinical: z
			.object({
				diagnosis: z.string().nullable(),
				lastReportDate: z.string().nullable(),
			})
			.optional(),
		note: z.string().optional(),
		upcoming: z.array(AppointmentOut),
		recent: z.array(AppointmentOut),
		packages: z
			.array(
				z.object({
					id: z.string(),
					name: z.string(),
					sessionsLeft: z.number(),
					dueBani: z.number(),
				}),
			)
			.optional(),
	});
	return staffTool(session, {
		key: "clientSummary",
		phase: "read",
		description:
			"One client's file as far as the person may see it: contact, guardian, upcoming and recent appointments, packages, and clinical data only when the service returned it. Defaults to the client on the open screen.",
		inputSchema: z.object({ clientId: IdSchema.optional() }).strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const id = input.clientId ?? s.page?.clientId;
			if (id === undefined) return refuse("invalid");
			const [found, resources] = await Promise.all([s.port.clientSummary(id), s.port.resources()]);
			if (!found.ok) return { ...refuse(found.reason), subjects: [id] };
			const c = found.value;
			const named = resources.ok ? resources.value : [];
			const out = (a: (typeof c.upcoming)[number]): AppointmentOut => ({
				id: a.id,
				date: a.date,
				weekday: weekdayName(s.copy, a.date),
				when: clockRange(a.startMin, a.durationMin),
				status: a.status,
				who: fenceOrNull(a.clientName ?? a.title),
				resources: resourceNames(named, a.resourceIds),
				note: fenceOrNull(a.note),
			});
			return {
				ok: true,
				subjects: [c.id],
				cards: [clientCard(s.copy, c, named, s.links)],
				output: {
					status: "ok",
					id: c.id,
					name: fence(c.name),
					archived: c.status === "archived",
					...(c.phone !== undefined || c.email !== undefined
						? { contact: { phone: c.phone ?? null, email: c.email ?? null } }
						: {}),
					...(c.guardian === undefined ? {} : { guardian: fenceOrNull(c.guardian) }),
					...(c.clinical === undefined
						? {}
						: {
								clinical: {
									diagnosis: fenceOrNull(c.clinical.diagnosis),
									lastReportDate: c.clinical.lastReportDate ?? null,
								},
							}),
					...(c.note === undefined ? {} : { note: fence(c.note) }),
					upcoming: c.upcoming.slice(0, 10).map(out),
					recent: c.recent.slice(0, 10).map(out),
					...(c.packages === undefined
						? {}
						: {
								packages: c.packages.map((p) => ({
									id: p.id,
									name: fence(p.name),
									sessionsLeft: p.sessions + p.bonus - p.used,
									dueBani: p.totalBani - p.paidBani,
								})),
							}),
				},
			};
		},
	});
}

export function agendaTool(session: StaffSession) {
	const Out = z.union([
		z.object({
			status: z.literal("ok"),
			from: z.string(),
			to: z.string(),
			count: z.number(),
			appointments: z.array(AppointmentOut),
			truncated: z.boolean(),
		}),
		Ambiguous,
		NoMatch,
	]);
	return staffTool(session, {
		key: "agenda",
		phase: "read",
		description:
			"The agenda of a day or a few days, for everyone or for one person, room or device (by name or id). Dates are the clinic's calendar days.",
		inputSchema: z
			.object({
				from: DateSchema.optional().describe("First day, YYYY-MM-DD; today by default"),
				days: z.number().int().min(1).max(14).default(1),
				resource: z.string().trim().min(1).max(120).optional(),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const from = input.from ?? today(s);
			const to = addDays(from, input.days - 1);
			const resources = await s.port.resources();
			if (!resources.ok) return refuse(resources.reason);
			let resourceId: string | undefined;
			let scope =
				input.days === 1
					? dateLabel(s.copy, from)
					: `${dateLabel(s.copy, from)} – ${dateLabel(s.copy, to)}`;
			if (input.resource !== undefined) {
				const resolved = await resolveResource(s, input.resource);
				if (!resolved.ok) return refuse(resolved.reason);
				if (resolved.value.kind === "none")
					return { ok: true, subjects: [], output: { status: "none" } };
				if (resolved.value.kind === "many") {
					return {
						ok: true,
						subjects: [],
						output: {
							status: "ambiguous",
							candidates: resolved.value.candidates.map((r) => ({
								id: r.id,
								name: r.name,
							})),
						},
					};
				}
				resourceId = resolved.value.value.id;
				scope = `${resolved.value.value.name} · ${scope}`;
			}
			const found = await s.port.agenda({
				from,
				to,
				...(resourceId === undefined ? {} : { resourceId }),
			});
			if (!found.ok) return refuse(found.reason);
			const shown = found.value.slice(0, MAX_AGENDA_ROWS);
			return {
				ok: true,
				subjects: shown.map((a) => a.id),
				cards: [
					agendaCard(
						s.copy,
						scope,
						appointmentRows(s.copy, shown, resources.value, s.links, input.days > 1),
					),
				],
				output: {
					status: "ok",
					from,
					to,
					count: found.value.length,
					truncated: found.value.length > shown.length,
					appointments: shown.map((a) => ({
						id: a.id,
						date: a.date,
						weekday: weekdayName(s.copy, a.date),
						when: clockRange(a.startMin, a.durationMin),
						status: a.status,
						who: fenceOrNull(a.clientName ?? a.title),
						resources: resourceNames(resources.value, a.resourceIds),
						note: fenceOrNull(a.note),
					})),
				},
			};
		},
	});
}

export function freeSlotsTool(session: StaffSession) {
	const Out = z.union([
		z.object({
			status: z.literal("ok"),
			serviceId: z.string(),
			slots: z.array(
				z.object({
					date: z.string(),
					startMin: z.number(),
					durationMin: z.number(),
					resourceIds: z.array(z.string()),
					resources: z.array(z.string()),
				}),
			),
		}),
		z.object({ status: z.literal("none") }),
		Ambiguous,
	]);
	return staffTool(session, {
		key: "freeSlots",
		phase: "read",
		description:
			"Free times for a service (by name or id), optionally for one person, room or device, over the coming days. Staff view: every column. Offer only these times.",
		inputSchema: z
			.object({
				service: z.string().trim().min(1).max(120),
				resource: z.string().trim().min(1).max(120).optional(),
				from: DateSchema.optional(),
				days: z.number().int().min(1).max(31).default(7),
				limit: z.number().int().min(1).max(20).default(8),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const service = await resolveService(s, input.service);
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
			let resourceId: string | undefined;
			if (input.resource !== undefined) {
				const resolved = await resolveResource(s, input.resource);
				if (!resolved.ok) return refuse(resolved.reason);
				if (resolved.value.kind === "none")
					return { ok: true, subjects: [], output: { status: "none" } };
				if (resolved.value.kind === "many") {
					return {
						ok: true,
						subjects: [],
						output: {
							status: "ambiguous",
							candidates: resolved.value.candidates.map((x) => ({
								id: x.id,
								name: x.name,
							})),
						},
					};
				}
				resourceId = resolved.value.value.id;
			}
			const from = input.from ?? today(s);
			const [found, resources] = await Promise.all([
				s.port.freeSlots({
					serviceId: service.value.value.id,
					from,
					to: addDays(from, input.days - 1),
					limit: input.limit,
					...(resourceId === undefined ? {} : { resourceId }),
				}),
				s.port.resources(),
			]);
			if (!found.ok) return refuse(found.reason);
			const named = resources.ok ? resources.value : [];
			const slots = found.value.slice(0, input.limit);
			return {
				ok: true,
				subjects: [service.value.value.id],
				cards: [slotsCard(s.copy, slots, named)],
				output:
					slots.length === 0
						? { status: "none" }
						: {
								status: "ok",
								serviceId: service.value.value.id,
								slots: slots.map((x) => ({
									...x,
									resources: resourceNames(named, x.resourceIds),
								})),
							},
			};
		},
	});
}
