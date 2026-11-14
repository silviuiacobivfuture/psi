import { z } from "zod";
import { type ActionInfo, checkParams, matchActions } from "./actions";
import { fenceDeep } from "./parity/generate";
import { NeedsConfirmationSchema, propose } from "./propose";
import { type StaffSession, staffTool, type ToolRun } from "./session";
import { CreateClientOut, NewClientFields, runCreateClient } from "./tools-clients";
import { refuse } from "./tools-shared";

const Listed = z.object({
	id: z.string(),
	label: z.string(),
	summary: z.string(),
	kind: z.enum(["read", "write"]),
	params: z.array(
		z.object({
			name: z.string(),
			label: z.string(),
			kind: z.string(),
			required: z.boolean(),
			choices: z.array(z.string()).optional(),
		}),
	),
});

/** What the person may do on the open screen, from the registry: nothing listed is something they may not do. */
export function listActionsTool(session: StaffSession) {
	const Out = z.union([
		z.object({ status: z.literal("ok"), actions: z.array(Listed) }),
		z.object({ status: z.literal("none") }),
	]);
	return staffTool(session, {
		key: "listActions",
		phase: "read",
		description:
			"Discover what this person can do on the open screen: every action of the app they may use, with its parameters. Call it BEFORE telling anyone that something cannot be done (adding a note, blacklisting a client, uploading a file, copying a week…). Optional `about` narrows it to the words of the request. An action not listed here is one the person may not do.",
		inputSchema: z
			.object({
				about: z.string().trim().max(200).optional(),
			})
			.strict(),
		outputSchema: Out,
		async run(input, s): Promise<ToolRun<z.infer<typeof Out>>> {
			const all = await s.port.listActions(s.page);
			if (!all.ok) return refuse(all.reason);
			const about = input.about === undefined ? [] : matchActions(all.value, input.about);
			const shown: ReadonlyArray<ActionInfo> =
				input.about !== undefined && about.length > 0 ? about : all.value;
			return {
				ok: true,
				subjects: shown.map((a) => a.id),
				output:
					shown.length === 0
						? { status: "none" }
						: {
								status: "ok",
								actions: shown.map((a) => ({
									id: a.id,
									label: a.label,
									summary: a.summary,
									kind: a.kind,
									params: a.params.map((p) => ({
										name: p.name,
										label: p.label,
										kind: p.kind,
										required: p.required,
										...(p.choices === undefined ? {} : { choices: p.choices }),
									})),
								})),
							},
			};
		},
	});
}

const RunOut = z.union([
	z.object({ status: z.literal("ok"), summary: z.string(), data: z.unknown() }),
	NeedsConfirmationSchema,
	z.object({
		status: z.literal("missing"),
		missing: z.array(z.string()),
		unknown: z.array(z.string()),
	}),
]);

/**
 * Runs one discovered action as the person. A read answers at once; a write prepares the usual
 * card, and only the person's Confirm runs it (the registry is asked again then).
 */
export function runActionTool(session: StaffSession) {
	return staffTool(session, {
		key: "runAction",
		phase: "propose",
		description:
			"Run an action found with staffListActions, by its id, with its parameters. A read returns its answer; a change only prepares a card the person confirms. If a required parameter is missing the answer names it: ask the person for exactly that.",
		inputSchema: z
			.object({
				actionId: z.string().min(3).max(80),
				params: z.record(z.string(), z.unknown()).default({}),
			})
			.strict(),
		outputSchema: RunOut,
		async run(input, s): Promise<ToolRun<z.infer<typeof RunOut>>> {
			const here = await s.port.listActions(s.page);
			if (!here.ok) return refuse(here.reason);
			// What the open screen offers, else anything the person may do anywhere (found with staffApiDiscover).
			let page = s.page;
			let action = here.value.find((a) => a.id === input.actionId);
			if (action === undefined && page !== undefined) {
				const anywhere = await s.port.listActions(undefined);
				if (!anywhere.ok) return refuse(anywhere.reason);
				action = anywhere.value.find((a) => a.id === input.actionId);
				page = undefined;
			}
			if (action === undefined || (s.allow !== undefined && !s.allow.has(action.id)))
				return { ok: false, reason: "not_allowed", subjects: [input.actionId] };
			const check = checkParams(action, input.params);
			if (check.missing.length > 0 || check.unknown.length > 0)
				return {
					ok: true,
					subjects: [action.id],
					output: {
						status: "missing",
						missing: check.missing,
						unknown: check.unknown,
					},
				};
			if (action.kind === "write") {
				return propose(
					s,
					{
						kind: "run_action",
						actionId: action.id,
						params: input.params,
						...(page === undefined ? {} : { page }),
					},
					{
						title: s.copy.proposal.runAction(action.label),
						destructive: action.destructive,
						lines: [
							...Object.entries(input.params).map(([name, value]) => ({
								label: action.params.find((p) => p.name === name)?.label ?? name,
								value: typeof value === "string" ? value : JSON.stringify(value),
								free: true,
							})),
						],
					},
				);
			}
			const ran = await s.port.runAction({
				id: action.id,
				params: input.params,
			});
			if (!ran.ok) return { ...refuse(ran.reason), subjects: [action.id] };
			return {
				ok: true,
				subjects: [action.id],
				output: {
					status: "ok",
					summary: ran.value.summary,
					data: fenceDeep(ran.value.data),
				},
			};
		},
	});
}

/** Adds a client: the card the person confirms. With a booking in the same request, use staffCreateAppointment's `newClient`. */
export function createClientTool(session: StaffSession) {
	return staffTool(session, {
		key: "createClient",
		phase: "propose",
		description:
			"Prepare adding a NEW client (name, and phone, e-mail, guardian, age or date of birth when the person gave them). It adds nothing; the person confirms in a card. If they also want an appointment for this person, do not use this: call staffCreateAppointment with `newClient`, so one card does both. A client with the same name is reported instead; pass anotherPerson only after the person says it is someone else.",
		inputSchema: z.object({ ...NewClientFields, anotherPerson: z.boolean().optional() }).strict(),
		outputSchema: CreateClientOut,
		run: (input, s) => runCreateClient(input, s),
	});
}
