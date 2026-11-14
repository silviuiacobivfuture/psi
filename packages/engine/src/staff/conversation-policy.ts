import type { AssistantSettingsType } from "@psi/scheduling-sdk/contract";
import type { StaffCopy } from "./copy";
import type { StaffEvent, TurnRefusal } from "./events";

/** Refusals that say nothing about whether the assistant could help: a double press, a malformed post, nobody signed in. */
const NOT_COUNTED: ReadonlySet<TurnRefusal> = new Set(["duplicate", "invalid", "no_principal"]);

/** The most conversations whose refusals are remembered; the oldest is forgotten first. */
const MAX_TRACKED = 20_000;

/**
 * Per conversation (person and thread): how many times the assistant refused (a turn refused, or a tool refused it), and
 * whether the person was already offered someone to ask. Held in this process, bounded.
 */
export class RefusalTracker {
	private readonly counts = new Map<string, number>();
	private readonly offered = new Set<string>();

	add(thread: string, n: number): number {
		const total = (this.counts.get(thread) ?? 0) + n;
		this.counts.delete(thread);
		if (this.counts.size >= MAX_TRACKED) {
			const oldest = this.counts.keys().next().value;
			if (oldest !== undefined) {
				this.counts.delete(oldest);
				this.offered.delete(oldest);
			}
		}
		this.counts.set(thread, total);
		return total;
	}

	/** True the first time it is asked for a conversation, false after. */
	offerOnce(thread: string): boolean {
		if (this.offered.has(thread)) return false;
		this.offered.add(thread);
		return true;
	}
}

export interface GovernedArgs {
	thread: string;
	settings: AssistantSettingsType;
	copy: StaffCopy;
	tracker: RefusalTracker;
	/** Told what the person finally reads, once, when the turn is done. */
	onFinished?: (answer: string) => void;
}

/**
 * The turn's events as they go out, with the organisation's handoff: once the conversation met `afterRefusals`
 * refusals (and `handoff.enabled`), one line saying who can help is added before `done`, once per conversation.
 */
export async function* governed(
	events: AsyncIterable<StaffEvent>,
	args: GovernedArgs,
): AsyncGenerator<StaffEvent, void, undefined> {
	let answer = "";
	let refused = 0;
	for await (const event of events) {
		if (event.type === "text") answer += event.delta;
		else if (event.type === "replace") answer = event.text;
		else if (event.type === "refusal" && !NOT_COUNTED.has(event.reason)) refused += 1;
		else if (event.type === "tool" && event.phase === "refused") refused += 1;
		if (event.type !== "done") {
			yield event;
			continue;
		}
		const h = args.settings.handoff;
		const total = refused > 0 ? args.tracker.add(args.thread, refused) : 0;
		if (h.enabled && total >= h.afterRefusals && args.tracker.offerOnce(args.thread)) {
			const line = args.copy.handoff(h.contact);
			const delta = answer.trim() === "" ? line : `\n\n${line}`;
			answer += delta;
			yield { type: "text", delta };
		}
		args.onFinished?.(answer);
		yield event;
	}
}
