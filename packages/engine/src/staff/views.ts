import type { StaffCard, TurnRefusal } from "./events";
import type { ConfirmOutcome } from "./execute";

/**
 * One change to the open page, as Datastar patches it. With a `selector` and a mode the HTML is
 * inserted there; without, it replaces the element with the same id.
 */
export interface ViewPatch {
	selector?: string;
	mode?: "append" | "prepend" | "inner" | "outer";
	html: string;
}

/**
 * How the console draws a turn. The engine cannot render (the UI library sits above it), so the
 * component library implements this (`@psi/ui/staff-assistant`) and the console passes it in. It
 * owns every id and word on the page; the routes only forward its patches.
 */
export interface StaffViews {
	/** The person's message and the empty answer it will fill. */
	exchange(x: { id: string; message: string }): ViewPatch;
	/** A tool's chip: first as running, then replaced by its outcome. */
	chip(x: {
		id: string;
		callId: string;
		label: string;
		phase: "running" | "done" | "refused";
	}): ViewPatch;
	/** The answer's text so far. */
	text(x: { id: string; text: string }): ViewPatch;
	card(x: { id: string; card: StaffCard }): ViewPatch;
	/** The turn could not be answered. */
	refusal(x: { id: string; reason: TurnRefusal }): ViewPatch;
	/** The turn is over. */
	done(x: { id: string }): ViewPatch;
	/** The day at a glance, shown when the panel opens. */
	briefing(x: { card: StaffCard }): ViewPatch;
	/** What a confirmation came to, replacing the proposal's card. */
	result(x: { outcome: ConfirmOutcome }): ViewPatch;
	/** The proposal was dismissed. */
	dismissed(x: { proposalId: string }): ViewPatch;
}
