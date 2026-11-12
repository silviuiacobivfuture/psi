import {
	type Guide,
	type HistoryTurn,
	MAX_HISTORY_TURN_LENGTH,
	MAX_HISTORY_TURNS,
} from "@psi/guide";
import type { ConversationStore } from "../stores/types";

/**
 * Guide conversation memory for a signed-in person who granted `guide_memory` (docs/plans/accounts.md §3,
 * "History"). The remembered turns are the ACCOUNT's (account_conversation, one per account and site):
 * they go to the guide as `history`, and each answered turn is appended when its stream finishes. Kept
 * here rather than in the engine's thread store because a person must be able to see and delete every
 * word: deleting a conversation in /cont/conversatii deletes the only copy. A refused or broken answer
 * is never kept.
 *
 * Without consent the app never wraps the guide, and nothing is stored.
 */
export function rememberingGuide(
	guide: Guide,
	memory: {
		conversations: ConversationStore;
		subject: string;
		site: string;
		now?: () => number;
	},
): Guide {
	const now = memory.now ?? Date.now;
	return {
		brand: guide.brand,
		model: guide.model,
		async *ask(input, control) {
			const kept = await memory.conversations.forSite(memory.subject, memory.site);
			const past =
				kept === null ? [] : await memory.conversations.turns(kept.id, MAX_HISTORY_TURNS / 2);
			const page = input.history ?? [];
			// The page already sends this visit's turns; a stored turn it carries is not sent twice.
			const onPage = new Set(
				page.filter((t) => t.role === "user").map((t) => t.text.slice(0, MAX_HISTORY_TURN_LENGTH)),
			);
			const remembered: HistoryTurn[] = past
				.filter((t) => !onPage.has(t.question.slice(0, MAX_HISTORY_TURN_LENGTH)))
				.flatMap((t) => [
					{ role: "user", text: t.question.slice(0, MAX_HISTORY_TURN_LENGTH) },
					{ role: "guide", text: t.answer.slice(0, MAX_HISTORY_TURN_LENGTH) },
				]);
			const history = [...remembered, ...page].slice(-MAX_HISTORY_TURNS);
			let answer = "";
			let refused = false;
			let finished = false;
			for await (const event of guide.ask(
				{ ...input, ...(history.length === 0 ? {} : { history }) },
				control,
			)) {
				if (event.type === "text") answer += event.delta;
				if (event.type === "refusal") refused = true;
				if (event.type === "done") finished = true;
				yield event;
			}
			if (finished && !refused && answer.trim() !== "") {
				await memory.conversations.append(memory.subject, memory.site, {
					question: input.question,
					answer,
					at: now(),
				});
			}
		},
	};
}
