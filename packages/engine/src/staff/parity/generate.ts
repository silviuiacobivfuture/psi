import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { z as z4 } from "zod/v4";
import { fence } from "../fence";
import { propose } from "../propose";
import { guardedRun, RefusedOutputSchema, type StaffSession, type ToolRun } from "../session";
import { baseKeys } from "./needs";
import { isParityRoute, isWrite, parityToolId, type RouteLike, writtenByStrangers } from "./routes";

const MAX_ITEMS = 40;
const MAX_CHARS = 12_000;

/** Values that are structure, not prose: ids, dates, short enum words and numbers stay as they are. */
const PLAIN = /^([A-Za-z0-9][A-Za-z0-9_.:-]{0,63}|\d{4}-\d{2}-\d{2}([T ][\d:.+Z-]+)?)$/;

/**
 * An answer from the service as the model reads it: every string that is not an id, a date or a
 * short code is free text from a record and goes inside the data fence; long lists are cut.
 */
export function fenceDeep(value: unknown, depth = 0): unknown {
	if (typeof value === "string") return PLAIN.test(value) ? value : fence(value);
	if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => fenceDeep(v, depth + 1));
	if (typeof value === "object" && value !== null && depth < 8) {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fenceDeep(v, depth + 1)]));
	}
	return value;
}

function bounded(value: unknown): { data: unknown; truncated: boolean } {
	const fenced = fenceDeep(value);
	const text = JSON.stringify(fenced) ?? "null";
	const cut = Array.isArray(value) && value.length > MAX_ITEMS;
	return text.length <= MAX_CHARS
		? { data: fenced, truncated: cut }
		: { data: text.slice(0, MAX_CHARS), truncated: true };
}

/** One input object for a call: the route's path, query and body fields flattened, `app` left to the session. */
export function inputSchemaOf(route: RouteLike): z4.ZodObject {
	const shape: Record<string, z4.ZodType> = {};
	for (const part of [route.params, route.query, route.body]) {
		if (part === undefined) continue;
		for (const [key, schema] of Object.entries(part.shape))
			if (key !== "app") shape[key] = schema as z4.ZodType;
	}
	return z4.object(shape).strict();
}

const ReadOut = z.object({ status: z.literal("ok"), data: z.unknown(), truncated: z.boolean() });
const ProposedOut = z.object({
	status: z.literal("needs_confirmation"),
	proposalId: z.string(),
	summary: z.string(),
	instruction: z.string(),
});

type Output = z.infer<typeof ReadOut> | z.infer<typeof ProposedOut>;

function describe(route: RouteLike): string {
	const kind = isWrite(route)
		? "Prepares this change: nothing happens until the person confirms in a card."
		: "Reads.";
	return `${route.summary}. ${kind} (${route.method} ${route.path.replace("/v1/apps/:app", "")})`;
}

/**
 * One tool for every route of the table the person may use. The tools are made fresh each turn
 * from the table and the person's capabilities: a route whose permission they do not hold gets no
 * tool, so the model is never shown it; a route with no permission of its own (their identity)
 * is always offered. Reads run directly; any other method prepares a proposal that only the
 * console's Confirm button executes. The service's own check still answers every call.
 */
export function parityTools(
	session: StaffSession,
	routes: ReadonlyArray<RouteLike>,
	capabilities: ReadonlySet<string>,
): Record<string, ReturnType<typeof createTool>> {
	const held = baseKeys(capabilities);
	const tools: Record<string, ReturnType<typeof createTool>> = {};
	for (const route of routes) {
		if (!isParityRoute(route)) continue;
		if (route.permission !== undefined && !held.has(route.permission.key)) continue;
		const id = parityToolId(route);
		const phase = isWrite(route) ? "propose" : "read";
		tools[id] = createTool({
			id,
			description: describe(route),
			inputSchema: inputSchemaOf(route),
			outputSchema: z.union([isWrite(route) ? ProposedOut : ReadOut, RefusedOutputSchema]),
			execute: async (input: Record<string, unknown>) =>
				guardedRun(session, id, phase, async (): Promise<ToolRun<Output>> => {
					const parsed = z4.record(z4.string(), z4.unknown()).safeParse(input);
					if (!parsed.success) return { ok: false, reason: "invalid" };
					const args = parsed.data;
					const subjects = Object.entries(args).flatMap(([k, v]) =>
						typeof v === "string" && /(^id$|Id$|^subject$)/.test(k) ? [v.slice(0, 120)] : [],
					);
					if (isWrite(route)) {
						if (session.taint.stranger) return { ok: false, reason: "tainted", subjects };
						return propose(
							session,
							{
								kind: "route_call",
								routeId: route.id,
								input: { app: session.principal.appId, ...args },
							},
							{
								title: route.summary,
								destructive:
									route.method === "DELETE" || /cancel|remove|delete/.test(route.audit ?? route.id),
								lines: Object.entries(args).map(([label, value]) => ({
									label,
									value: typeof value === "string" ? value : JSON.stringify(value),
									free: true,
								})),
							},
						);
					}
					const answer = await session.port.callRoute({
						routeId: route.id,
						input: { app: session.principal.appId, ...args },
					});
					if (!answer.ok) return { ok: false, reason: answer.reason, subjects };
					if (writtenByStrangers(route)) session.taint.stranger = true;
					return {
						ok: true,
						subjects,
						output: { status: "ok" as const, ...bounded(answer.value) },
					};
				}),
		});
	}
	return tools;
}
