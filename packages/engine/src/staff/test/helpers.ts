import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import { SESSION_KEY, type StaffSession } from "../session";
import { type FakeStaffPort, openTestSession } from "../testing";
import { STAFF_TOOLS } from "../tool-ids";
import { staffTools } from "../tools";

export type ToolKey = keyof typeof STAFF_TOOLS;

export async function sessionFor(
	port: FakeStaffPort,
	options: Parameters<typeof openTestSession>[1] = {},
): Promise<StaffSession> {
	const session = await openTestSession(port, options);
	if (session === undefined) throw new Error("the fake port refused whoami");
	return session;
}

const Output = z.object({ status: z.string() }).passthrough();
const Runnable = z.object({
	inputSchema: z.custom<z.ZodTypeAny>((value) => value instanceof z.ZodType),
	execute: z.custom<(input: unknown, context: object) => Promise<unknown>>(
		(value) => typeof value === "function",
	),
});

/** Runs one staff tool the way Mastra does: the input parsed with the tool's schema, then executed. */
export async function call(
	session: StaffSession,
	key: ToolKey,
	input: Record<string, unknown> = {},
): Promise<z.infer<typeof Output> & Record<string, unknown>> {
	const tools = await staffTools({
		requestContext: new RequestContext([[SESSION_KEY, session]]),
	});
	const tool = Runnable.parse(tools[STAFF_TOOLS[key]]);
	return Output.parse(await tool.execute(tool.inputSchema.parse(input), {}));
}

/** The proposal id a write tool returned. */
export function proposalIdOf(output: Record<string, unknown>): string {
	const id = output.proposalId;
	if (typeof id !== "string") throw new Error(`no proposal in ${JSON.stringify(output)}`);
	return id;
}
