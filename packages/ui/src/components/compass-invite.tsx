/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { suggest } from "./compass-actions";

/**
 * What makes the compass noticed, every word rendered by the server in the site's own voice (the
 * page script in `client/compass-invite.ts` only decides when to show it):
 * a short label on the capsule, example questions the field cycles through, and one nudge that
 * fits the page the visitor is on.
 */
export interface CompassNudge {
	/** The guide's invitation, in its voice ("Vrei să-ți explic articolul pe scurt?"). */
	text: string;
	/** What the invitation asks on the visitor's behalf when clicked, in the visitor's voice. */
	question: string;
	/** Accessible name of the dismiss button. */
	close: string;
}

export interface CompassInvite {
	/** The short line on the capsule inviting a question. */
	label: string;
	/** Example questions for the field: the first is shown at once, the rest follow in turn. */
	placeholders: ReadonlyArray<string>;
	nudge?: CompassNudge;
	/** Where the page reports `open`, `nudge` and `nudge_click` (cookieless counters). */
	signalUrl?: string;
}

/** The label, set on the capsule's upper edge; it goes while the field is in use. */
export function InviteLabel({ label }: { label: string }): JSX.Element {
	return (
		<button
			type="button"
			class="pz-compass__invite"
			tabindex={-1}
			data-on:click="$compassOpen = true; el.closest('.pz-compass').querySelector('.pz-compass__input').focus()"
		>
			<span class="pz-compass__invite-dot" aria-hidden="true" />
			{label}
		</button>
	);
}

/** The speech bubble above the capsule: hidden until the page script shows it, once per session. */
export function Nudge({ nudge }: { nudge: CompassNudge }): JSX.Element {
	return (
		<div class="pz-compass__nudge" role="status" hidden>
			<div class="pz-compass__nudge-card">
				<button type="button" class="pz-compass__nudge-ask" data-on:click={suggest(nudge.question)}>
					{nudge.text}
				</button>
				<button type="button" class="pz-compass__nudge-close" aria-label={nudge.close}>
					<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
						<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" fill="none" />
					</svg>
				</button>
			</div>
		</div>
	);
}
