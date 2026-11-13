import type { StaffCopy } from "./copy";
import type { StaffCard } from "./events";

/** Where a sentence ends: a full stop, `!`, `?` or an ellipsis followed by a space, or a line break. */
const SENTENCE_END = /(?<=[.!?…])(?=\s)|\n+/;

function sentences(text: string): Array<string> {
	return text.split(SENTENCE_END).filter((s) => s.trim() !== "");
}

/** A phrase that says the thing was NOT done ("nu am pregătit", "I have not prepared"). */
const NEGATED = /\b(nu|n-am|n-a|nici|not|never|no|didn't|haven't|did not|have not)\b/i;

/**
 * The reply without the sentences that claim a change is waiting when none is. Only the false
 * claim is removed, never the rest: the person keeps what was true. `claimed` tells the turn to
 * say what actually happened.
 */
export function withoutUnbackedClaims(
	copy: StaffCopy,
	text: string,
): { text: string; claimed: boolean } {
	const kept: Array<string> = [];
	let claimed = false;
	for (const sentence of sentences(text)) {
		if (copy.claimsPrepared.test(sentence) && !NEGATED.test(sentence)) claimed = true;
		else kept.push(sentence.trim());
	}
	return { text: kept.join(" "), claimed };
}

/**
 * A reply the model could not finish (the token limit, a step limit, a stream that ended): what
 * was written, back to its last whole sentence, and a plain note that it stopped there. A reply
 * with no whole sentence keeps all it has.
 */
export function finishedShort(copy: StaffCopy, text: string): string {
	const parts = sentences(text.trimEnd());
	const last = text.trimEnd().slice(-1);
	const whole = /[.!?…:]/.test(last) ? parts : parts.slice(0, -1);
	const kept = whole.length > 0 ? whole.join(" ").trim() : text.trim();
	return `${kept} ${copy.cutShort}`.trim();
}

/** A card with nothing in it: its title and the words "nothing here". */
export function isEmptyCard(card: StaffCard): boolean {
	switch (card.kind) {
		case "agenda":
		case "list":
			return card.rows.length === 0;
		case "slots":
			return card.slots.length === 0;
		default:
			return false;
	}
}
