import { newId } from "../store/ids";
import type { Deps } from "./context";

export interface AuditInput {
	app: string;
	actor: { subject: string; kind: "person" | "service" };
	action: string;
	target: { type: string; id: string };
	detail?: Record<string, unknown> | undefined;
}

/** Appends an audit event. Detail holds ids and counts, never values (a diagnosis never lands here). */
export async function writeAudit(
	deps: Pick<Deps, "store" | "clock">,
	input: AuditInput,
): Promise<void> {
	await deps.store.c.audit.insert({
		id: newId("e"),
		app: input.app,
		at: deps.clock(),
		actor: input.actor,
		action: input.action,
		target: input.target,
		...(input.detail === undefined ? {} : { detail: input.detail }),
	});
}
