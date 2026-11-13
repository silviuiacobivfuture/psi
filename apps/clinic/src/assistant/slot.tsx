import { staffCopy } from "@psi/engine/staff";
import { StaffCapsule, StaffPanel, StaffTrigger } from "@psi/ui/staff-assistant";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Ctx } from "../lib/context";
import { ASSISTANT_BASE, pageOf } from "./mount";

/** The glowing "Asistent" button for the top bar; nothing when the assistant is off. */
export function AssistantTrigger({ ctx }: { ctx: Ctx }): JSX.Element | null {
	if (ctx.assistant === undefined) return null;
	return (
		<StaffTrigger
			labels={staffCopy(ctx.locale).panel}
			base={ASSISTANT_BASE}
			variant="bar"
			presentation={ctx.assistantMode === "bar" ? "capsule" : "panel"}
		/>
	);
}

/**
 * The assistant on the page, one of two presentations of the same conversation: the glowing bar at
 * the foot of the screen (the default) or the docked panel (a sheet on a phone). Page-aware: it
 * knows which screen and client are open.
 */
export function AssistantPanel({ ctx }: { ctx: Ctx }): JSX.Element | null {
	const engine = ctx.assistant;
	if (engine === undefined) return null;
	const url = new URL(ctx.c.req.url);
	const page = pageOf(url.pathname, url.searchParams.get("date") ?? undefined);
	const threadId = crypto.randomUUID().replaceAll("-", "").slice(0, 24);
	if (ctx.assistantMode === "bar")
		return (
			<StaffCapsule
				labels={staffCopy(ctx.locale).panel}
				base={ASSISTANT_BASE}
				page={page}
				suggestions={engine.suggestions(page.screen, ctx.locale)}
				threadId={threadId}
			/>
		);
	return (
		<StaffPanel
			labels={staffCopy(ctx.locale).panel}
			base={ASSISTANT_BASE}
			page={page}
			suggestions={engine.suggestions(page.screen, ctx.locale)}
			threadId={threadId}
			trigger={false}
		/>
	);
}
