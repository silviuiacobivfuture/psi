import { staffCopy } from "@psi/engine/staff";
import { StaffPanel, StaffTrigger } from "@psi/ui/staff-assistant";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Ctx } from "../lib/context";
import { ASSISTANT_BASE, pageOf } from "./mount";

/** The glowing "Asistent" button for the top bar; nothing when the assistant is off. */
export function AssistantTrigger({ ctx }: { ctx: Ctx }): JSX.Element | null {
	if (ctx.assistant === undefined) return null;
	return <StaffTrigger labels={staffCopy(ctx.locale).panel} base={ASSISTANT_BASE} variant="bar" />;
}

/** The docked panel (a sheet on a phone), page-aware: it knows which screen and client are open. */
export function AssistantPanel({ ctx }: { ctx: Ctx }): JSX.Element | null {
	const engine = ctx.assistant;
	if (engine === undefined) return null;
	const url = new URL(ctx.c.req.url);
	const page = pageOf(url.pathname, url.searchParams.get("date") ?? undefined);
	return (
		<StaffPanel
			labels={staffCopy(ctx.locale).panel}
			base={ASSISTANT_BASE}
			page={page}
			suggestions={engine.suggestions(page.screen, ctx.locale)}
			threadId={crypto.randomUUID().replaceAll("-", "").slice(0, 24)}
			trigger={false}
		/>
	);
}
