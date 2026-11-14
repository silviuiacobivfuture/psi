import type { AskContext } from "./ask-context";
import { isBookingIntent } from "./booking";
import type { AskInput, EngineEvent } from "./events";

/**
 * A booking request on a site that cannot reach the scheduling store: the profile's handoff, as
 * events. No model is asked, so it can never fail the way a lookup can: a warm line that says the
 * booking starts in the sister site (with the service the visitor named, when the profile can
 * tell; on a page of another brand, that brand's site), and the button that opens it. Undefined when the profile has no handoff, the site
 * schedules itself, or the message is not about booking.
 */
export function handoffEvents(
	ctx: AskContext,
	input: AskInput,
): ReadonlyArray<EngineEvent> | undefined {
	if (ctx.booking !== undefined) return undefined;
	const words = ctx.profile.locales[input.locale];
	const handoff =
		words?.handoffFor?.({ question: input.question, page: input.page }) ?? words?.handoff;
	if (handoff === undefined || !isBookingIntent(input.question, [...ctx.packs.values()])) {
		return undefined;
	}
	return [
		{ type: "text", delta: handoff.line },
		{
			type: "actions",
			actions: [{ kind: "link", label: handoff.label, href: handoff.href(input.question) }],
		},
		{ type: "done" },
	];
}
