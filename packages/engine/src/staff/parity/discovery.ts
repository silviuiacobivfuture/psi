import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { z as z4 } from "zod/v4";
import { propose } from "../propose";
import { missed, readScope } from "../read-cache";
import { guardedRun, RefusedOutputSchema, type StaffSession, type ToolRun } from "../session";
import { bounded, inputSchemaOf } from "./generate";
import { baseKeys } from "./needs";
import { isParityRoute, isWrite, type RouteLike, writtenByStrangers } from "./routes";

/** The three tools the model discovers and uses everything else through (progressive disclosure). */
export const DISCOVERY_TOOLS = {
	discover: "staffApiDiscover",
	describe: "staffApiDescribe",
	call: "staffApiCall",
} as const;

/** One thing the person can do: a route of the service, or an action of the console's registry. */
export interface CatalogueEntry {
	id: string;
	via: "route" | "action";
	kind: "read" | "write";
	summary: string;
	group: string;
	destructive: boolean;
}

const destructiveRoute = (r: RouteLike): boolean =>
	r.method === "DELETE" || /cancel|remove|delete|archive/.test(r.audit ?? r.id);

/** The routes this person may call (their capabilities, judged on base keys); none when the service could not say. */
export function routesFor(session: StaffSession): Array<RouteLike> {
	if (session.caps === undefined) return [];
	const held = baseKeys(session.caps);
	return session.routes.filter(
		(r) => isParityRoute(r) && (r.permission === undefined || held.has(r.permission.key)),
	);
}

/**
 * Everything the person can do, from the ONE table of the service and the console's registry, filtered by what they
 * hold. Kept per person, app, capability digest and configuration version, so a second turn asks nothing again and
 * no two people ever share it.
 */
export async function catalogueFor(session: StaffSession): Promise<Array<CatalogueEntry>> {
	const scope = readScope(session.principal.sub, session.principal.appId, session.caps);
	const key = `catalogue:${session.config.version}`;
	const held = session.reads.get(scope, key);
	if (!missed(held)) {
		const cached = z.array(z.custom<CatalogueEntry>()).safeParse(held);
		if (cached.success) return cached.data;
	}
	const routes: Array<CatalogueEntry> = routesFor(session).map((r) => ({
		id: r.id,
		via: "route",
		kind: isWrite(r) ? "write" : "read",
		summary: r.summary,
		group: r.id.split(".")[0] ?? r.id,
		destructive: isWrite(r) && destructiveRoute(r),
	}));
	const listed = await session.port.listActions(undefined);
	const actions: Array<CatalogueEntry> = listed.ok
		? listed.value.map((a) => ({
				id: a.id,
				via: "action",
				kind: a.kind,
				summary: a.summary,
				group: a.group ?? "actions",
				destructive: a.destructive,
			}))
		: [];
	const all = [...routes, ...actions];
	// Discovery may be kept far longer than a read: it changes only with capabilities or configuration (both in the key).
	session.reads.put(scope, key, all, 10 * 60_000);
	return all;
}

const norm = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** An offset cursor for the assistant's own pages (the service's lists carry their own). */
const cursorOf = (n: number): string => `o${n}`;
const offsetOf = (cursor: string | undefined): number => {
	const n = cursor === undefined ? 0 : Number.parseInt(cursor.slice(1), 10);
	return Number.isInteger(n) && n >= 0 ? n : 0;
};

const Cursor = z
	.string()
	.regex(/^o\d{1,6}$/)
	.optional();

const DiscoverOut = z.object({
	status: z.literal("ok"),
	items: z.array(
		z.object({
			id: z.string(),
			kind: z.enum(["read", "write"]),
			summary: z.string(),
			group: z.string(),
			destructive: z.boolean(),
			use: z.enum([DISCOVERY_TOOLS.call, "staffRunAction"]),
		}),
	),
	total: z.number(),
	nextCursor: z.string().optional(),
});

/** Lists what the person can do, searchable, filterable and paged; nothing beyond what they hold is ever listed. */
export function discoverTool(session: StaffSession) {
	const id = DISCOVERY_TOOLS.discover;
	const input = z
		.object({
			query: z.string().max(120).optional(),
			group: z.string().max(40).optional(),
			kind: z.enum(["read", "write"]).optional(),
			cursor: Cursor,
		})
		.strict();
	return createTool({
		id,
		description:
			"Find what you can do for this person beyond your named tools: every read and change of the app they are allowed, searchable by words (`query`), by area (`group`, e.g. clients, appointments, roles) and by kind. Answers ids with a one-line summary, a page at a time (pass `nextCursor` for more). Then read an item's inputs with staffApiDescribe and use it with the tool named in `use`.",
		inputSchema: input,
		outputSchema: z.union([DiscoverOut, RefusedOutputSchema]),
		execute: async (raw: z.infer<typeof input>) =>
			guardedRun(
				session,
				id,
				"read",
				async (): Promise<ToolRun<z.infer<typeof DiscoverOut>>> => {
					const words = norm(raw.query ?? "")
						.split(/\s+/)
						.filter((w) => w.length > 1);
					const hits = (await catalogueFor(session)).filter(
						(e) =>
							(raw.group === undefined || e.group === raw.group) &&
							(raw.kind === undefined || e.kind === raw.kind) &&
							(session.allow === undefined || session.allow.has(e.id)) &&
							words.every((w) => norm(`${e.id} ${e.summary} ${e.group}`).includes(w)),
					);
					const size = session.config.settings.pageSize;
					const from = offsetOf(raw.cursor);
					const page = hits.slice(from, from + size);
					return {
						ok: true,
						subjects: [],
						output: {
							status: "ok",
							items: page.map((e) => ({
								id: e.id,
								kind: e.kind,
								summary: e.summary,
								group: e.group,
								destructive: e.destructive,
								use: e.via === "route" ? DISCOVERY_TOOLS.call : "staffRunAction",
							})),
							total: hits.length,
							...(from + size < hits.length ? { nextCursor: cursorOf(from + size) } : {}),
						},
					};
				},
				raw,
			),
	});
}

const DescribeOut = z.object({
	status: z.literal("ok"),
	id: z.string(),
	kind: z.enum(["read", "write"]),
	summary: z.string(),
	destructive: z.boolean(),
	paginated: z.boolean(),
	input: z.unknown(),
});

/** The inputs one discovered item takes, as a JSON schema (a route) or a parameter list (an action). */
export function describeTool(session: StaffSession) {
	const id = DISCOVERY_TOOLS.describe;
	const input = z.object({ id: z.string().min(3).max(80) }).strict();
	return createTool({
		id,
		description:
			"What one item found with staffApiDiscover takes: its inputs (names, types, which are required), whether it changes anything and whether it is paged.",
		inputSchema: input,
		outputSchema: z.union([DescribeOut, RefusedOutputSchema]),
		execute: async (raw: z.infer<typeof input>) =>
			guardedRun(
				session,
				id,
				"read",
				async (): Promise<ToolRun<z.infer<typeof DescribeOut>>> => {
					const entry = (await catalogueFor(session)).find((e) => e.id === raw.id);
					if (entry === undefined) return { ok: false, reason: "not_allowed", subjects: [raw.id] };
					const route = session.routes.find((r) => r.id === raw.id);
					const listed =
						entry.via === "action" ? await session.port.listActions(undefined) : undefined;
					const params =
						listed?.ok === true ? listed.value.find((a) => a.id === raw.id)?.params : undefined;
					return {
						ok: true,
						subjects: [raw.id],
						output: {
							status: "ok",
							id: entry.id,
							kind: entry.kind,
							summary: entry.summary,
							destructive: entry.destructive,
							paginated: route?.query?.shape.cursor !== undefined,
							input:
								route === undefined
									? (params ?? [])
									: z4.toJSONSchema(inputSchemaOf(route), { unrepresentable: "any" }),
						},
					};
				},
				raw,
				`${id}:${raw.id}`,
			),
	});
}

const ReadOut = z.object({
	status: z.literal("ok"),
	data: z.unknown(),
	truncated: z.boolean(),
	nextCursor: z.string().optional(),
	cached: z.boolean(),
});
const ProposedOut = z.object({
	status: z.literal("needs_confirmation"),
	proposalId: z.string(),
	summary: z.string(),
	instruction: z.string(),
});

const ItemsShape = z
	.object({ items: z.array(z.unknown()), nextCursor: z.string().optional() })
	.passthrough();

/** Rows of an answer that are a list (the answer itself, or its `items`), for the assistant's own search and pages. */
function paged(
	value: unknown,
	search: string | undefined,
	cursor: string | undefined,
	size: number,
): { data: unknown; nextCursor?: string } {
	const shaped = ItemsShape.safeParse(value);
	const rows = Array.isArray(value) ? value : shaped.success ? shaped.data.items : undefined;
	if (rows === undefined) return { data: value };
	const words = norm(search ?? "")
		.split(/\s+/)
		.filter((w) => w.length > 1);
	const hits = rows.filter((row) =>
		words.every((w) => norm(JSON.stringify(row) ?? "").includes(w)),
	);
	// The service's own cursor wins when it paged the list itself; otherwise the assistant pages what came back.
	const own = shaped.success ? shaped.data.nextCursor : undefined;
	const from = own === undefined ? offsetOf(cursor) : 0;
	const page = hits.slice(from, from + size);
	const next = own ?? (from + size < hits.length ? cursorOf(from + size) : undefined);
	const data = Array.isArray(value)
		? page
		: { ...(shaped.success ? shaped.data : {}), items: page };
	return { data, ...(next === undefined ? {} : { nextCursor: next }) };
}

/**
 * Uses one discovered route as the person: its input is parsed with the route's own schema (strict; the app is the
 * session's), a read answers at once (kept a few seconds for this person only, and paged), a change only prepares a
 * card the person confirms. The service's authorization answers every call, with the person's own token.
 */
export function callTool(session: StaffSession) {
	const id = DISCOVERY_TOOLS.call;
	const input = z
		.object({
			id: z.string().min(3).max(80),
			input: z.record(z.string(), z.unknown()).default({}),
			search: z.string().max(120).optional(),
			cursor: z.string().max(200).optional(),
		})
		.strict();
	return createTool({
		id,
		description:
			"Use one route found with staffApiDiscover (`use: staffApiCall`), with the inputs staffApiDescribe gave. A read returns its answer a page at a time (pass `nextCursor`; `search` narrows the rows); a change prepares a card the person confirms, and nothing happens until they do.",
		inputSchema: input,
		outputSchema: z.union([ReadOut, ProposedOut, RefusedOutputSchema]),
		execute: async (raw: z.infer<typeof input>) =>
			guardedRun(
				session,
				id,
				(session.routes.find((r) => r.id === raw.id)?.method ?? "GET") === "GET"
					? "read"
					: "propose",
				async (): Promise<ToolRun<z.infer<typeof ReadOut> | z.infer<typeof ProposedOut>>> => {
					const route = routesFor(session).find((r) => r.id === raw.id);
					const subjects = Object.entries(raw.input).flatMap(([k, v]) =>
						typeof v === "string" && /(^id$|Id$|^subject$)/.test(k) ? [v.slice(0, 120)] : [],
					);
					if (route === undefined) return { ok: false, reason: "not_allowed", subjects: [raw.id] };
					if (session.allow !== undefined && !session.allow.has(route.id))
						return { ok: false, reason: "not_allowed", subjects: [raw.id] };
					const size = session.config.settings.pageSize;
					const pagedByService = route.query?.shape.limit !== undefined;
					const args: Record<string, unknown> = {
						...raw.input,
						...(pagedByService
							? {
									limit: Math.min(Number(raw.input.limit ?? size) || size, size),
									...(raw.cursor === undefined ? {} : { cursor: raw.cursor }),
								}
							: {}),
					};
					const parsed = inputSchemaOf(route).safeParse(args);
					if (!parsed.success) return { ok: false, reason: "invalid", subjects };
					const call = { routeId: route.id, input: { app: session.principal.appId, ...args } };
					if (isWrite(route)) {
						if (session.taint.stranger) return { ok: false, reason: "tainted", subjects };
						return propose(
							session,
							{ kind: "route_call", ...call },
							{
								title: route.summary,
								destructive: destructiveRoute(route),
								lines: Object.entries(raw.input).map(([label, value]) => ({
									label,
									value: typeof value === "string" ? value : JSON.stringify(value),
									free: true,
								})),
							},
						);
					}
					const scope = readScope(session.principal.sub, session.principal.appId, session.caps);
					const key = `route:${JSON.stringify(call)}`;
					const kept = session.reads.get(scope, key);
					let value: unknown = kept;
					const cached = !missed(kept);
					if (!cached) {
						const answer = await session.port.callRoute(call);
						if (!answer.ok) return { ok: false, reason: answer.reason, subjects };
						value = answer.value;
						session.reads.put(scope, key, value, session.config.settings.cacheTtlSeconds * 1_000);
					}
					if (writtenByStrangers(route)) session.taint.stranger = true;
					const page = paged(value, raw.search, pagedByService ? undefined : raw.cursor, size);
					return {
						ok: true,
						subjects,
						output: {
							status: "ok" as const,
							...bounded(page.data),
							...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
							cached,
						},
					};
				},
				raw,
				`${id}:${raw.id}`,
			),
	});
}

/** The discovery tools of a session: offered whenever the service's table is known. */
export function discoveryTools(
	session: StaffSession,
): Record<string, ReturnType<typeof createTool>> {
	if (session.routes.length === 0 && session.caps === undefined) return {};
	return {
		[DISCOVERY_TOOLS.discover]: discoverTool(session),
		[DISCOVERY_TOOLS.describe]: describeTool(session),
		[DISCOVERY_TOOLS.call]: callTool(session),
	};
}
