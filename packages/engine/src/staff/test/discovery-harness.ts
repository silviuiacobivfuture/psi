import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import { z as z4 } from "zod/v4";
import { DISCOVERY_TOOLS } from "../parity/discovery";
import { baseKeys } from "../parity/needs";
import type { RouteLike } from "../parity/routes";
import type { createReadCache } from "../read-cache";
import { SESSION_KEY } from "../session";
import { FakeStaffPort } from "../testing";
import { staffTools } from "../tools";
import { sessionFor } from "./helpers";
import { FIXTURE_ROUTES } from "./routes-fixture";

/** A session opened the real way for one set of permissions, its tools, and helpers to discover and call through them. */
const Executable = z.object({
	execute: z.custom<(input: unknown, context: object) => Promise<unknown>>(
		(v) => typeof v === "function",
	),
});
export const Listed = z.object({
	status: z.literal("ok"),
	items: z.array(z.object({ id: z.string(), use: z.string(), destructive: z.boolean() })),
	total: z.number(),
	nextCursor: z.string().optional(),
});

/** A paged list route, as the service's own (`limit` and `cursor` in its query). */
export const PAGED: RouteLike = {
	id: "notes.list",
	method: "GET",
	path: "/v1/apps/:app/notes",
	side: "team",
	summary: "Notes of the app",
	params: z4.object({ app: z4.string() }),
	query: z4.object({ limit: z4.number().optional(), cursor: z4.string().optional() }),
	permission: { key: "clients_view" },
};

export async function opened(
	permissions: ReadonlyArray<string> | null,
	o: {
		routes?: ReadonlyArray<RouteLike>;
		port?: FakeStaffPort;
		now?: () => number;
		reads?: ReturnType<typeof createReadCache>;
	} = {},
) {
	const port = o.port ?? new FakeStaffPort();
	port.permissions = permissions;
	const session = await sessionFor(port, {
		routes: o.routes ?? FIXTURE_ROUTES,
		...(o.now === undefined ? {} : { now: o.now }),
		...(o.reads === undefined ? {} : { reads: o.reads }),
	});
	const caps = await session.port.capabilities();
	session.caps = caps.ok ? baseKeys(caps.value.permissions) : undefined;
	session.config = port.config;
	const tools = await staffTools({ requestContext: new RequestContext([[SESSION_KEY, session]]) });
	const run = async (id: string, input: Record<string, unknown> = {}): Promise<unknown> =>
		Executable.parse(tools[id]).execute(input, {});
	const discover = async (input: Record<string, unknown> = {}) =>
		Listed.parse(await run(DISCOVERY_TOOLS.discover, input));
	const ids = async (input: Record<string, unknown> = {}): Promise<Array<string>> => {
		const out: Array<string> = [];
		let cursor: string | undefined;
		do {
			const page = await discover({ ...input, ...(cursor === undefined ? {} : { cursor }) });
			out.push(...page.items.map((i) => i.id));
			cursor = page.nextCursor;
		} while (cursor !== undefined);
		return out;
	};
	return { port, session, tools: Object.keys(tools), run, discover, ids };
}
export const call = (
	id: string,
	input: Record<string, unknown> = {},
	more: Record<string, unknown> = {},
) => ({
	id,
	input,
	...more,
});
