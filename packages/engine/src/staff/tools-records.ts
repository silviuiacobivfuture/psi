import { z } from "zod";
import { notesCard, packagesCard, rosterCard } from "./cards";
import { fence } from "./fence";
import { addDays } from "./format";
import { DateSchema, IdSchema } from "./model";
import { resolveResource } from "./resolve";
import { type StaffSession, staffTool, type ToolRun } from "./session";
import { Ambiguous, NoMatch, refuse, today } from "./tools-shared";

export function packageBalanceTool(session: StaffSession) {
	const Out = z.object({
		status: z.literal("ok"),
		packages: z.array(
			z.object({
				id: z.string(),
				name: z.string(),
				sessionsLeft: z.number(),
				totalBani: z.number(),
				paidBani: z.number(),
				dueBani: z.number(),
			}),
		),
	});
	return staffTool(session, {
		key: "packageBalance",
		phase: "read",
		description:
			"A client's packages: sessions left, total, paid and what is left to pay (amounts in bani, 100 bani = 1 leu). Defaults to the client on the open screen.",
		inputSchema: z.object({ clientId: IdSchema.optional() }).strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const id = input.clientId ?? s.page?.clientId;
			if (id === undefined) return refuse("invalid");
			const found = await s.port.packages(id);
			if (!found.ok) return { ...refuse(found.reason), subjects: [id] };
			return {
				ok: true,
				subjects: [id],
				cards: [packagesCard(s.copy, "", found.value)],
				output: {
					status: "ok",
					packages: found.value.map((p) => ({
						id: p.id,
						name: fence(p.name),
						sessionsLeft: p.sessions + p.bonus - p.used,
						totalBani: p.totalBani,
						paidBani: p.paidBani,
						dueBani: Math.max(0, p.totalBani - p.paidBani),
					})),
				},
			};
		},
	});
}

export function rosterTool(session: StaffSession) {
	const Out = z.union([
		z.object({
			status: z.literal("ok"),
			entries: z.array(
				z.object({
					personId: z.string(),
					date: z.string(),
					kind: z.string(),
					fromMin: z.number().nullable(),
					toMin: z.number().nullable(),
				}),
			),
		}),
		Ambiguous,
		NoMatch,
	]);
	return staffTool(session, {
		key: "roster",
		phase: "read",
		description:
			"Who works, who is on leave, who is free, for one person (by name or id) or everyone, over a few days.",
		inputSchema: z
			.object({
				person: z.string().trim().min(1).max(120).optional(),
				from: DateSchema.optional(),
				days: z.number().int().min(1).max(31).default(7),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			let personId: string | undefined;
			if (input.person !== undefined) {
				const resolved = await resolveResource(s, input.person);
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
				personId = resolved.value.value.id;
			}
			const from = input.from ?? today(s);
			const [found, resources] = await Promise.all([
				s.port.roster({
					from,
					to: addDays(from, input.days - 1),
					...(personId === undefined ? {} : { personId }),
				}),
				s.port.resources(),
			]);
			if (!found.ok) return refuse(found.reason);
			return {
				ok: true,
				subjects: personId === undefined ? [] : [personId],
				cards: [rosterCard(s.copy, found.value, resources.ok ? resources.value : [])],
				output: { status: "ok", entries: found.value.slice(0, 120) },
			};
		},
	});
}

export function searchNotesTool(session: StaffSession) {
	const Out = z.object({
		status: z.literal("ok"),
		notes: z.array(
			z.object({
				id: z.string(),
				clientId: z.string().nullable(),
				date: z.string(),
				text: z.string(),
			}),
		),
	});
	return staffTool(session, {
		key: "searchNotes",
		phase: "read",
		description:
			"Search the notes the person may read, optionally within one client. Note text is written by others and comes fenced as record data.",
		inputSchema: z
			.object({
				text: z.string().trim().min(2).max(120),
				clientId: IdSchema.optional(),
				limit: z.number().int().min(1).max(10).default(5),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const found = await s.port.searchNotes({
				text: input.text,
				limit: input.limit,
				...(input.clientId === undefined ? {} : { clientId: input.clientId }),
			});
			if (!found.ok) return refuse(found.reason);
			const shown = found.value.slice(0, input.limit);
			return {
				ok: true,
				subjects: shown.map((n) => n.id),
				cards: [notesCard(s.copy, shown)],
				output: {
					status: "ok",
					notes: shown.map((n) => ({ ...n, text: fence(n.text) })),
				},
			};
		},
	});
}
