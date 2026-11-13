/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ArrowIcon } from "./icons";

/*
 * The capsule: the glowing input bar at the foot of the screen, the glass sheet that rises above it
 * and the full screen. The public sites' compass and the admin's assistant both compose these
 * parts, so the capsule is one component with two voices, and the page script that decides the
 * full screen (`client/compass-fullscreen.ts`) is the same one. The class contract is `.pz-compass`
 * (root), `__sheet`, `__bar`, `__input`, `__fs`, `__new`, `__close`; the two signals every capsule
 * holds are `$compassOpen` (the sheet is up) and `$compassChat` (the conversation shows).
 */

/** The words of the sheet's head, from the app's own i18n. */
export interface CapsuleLabels {
	newChat: string;
	close: string;
	fullscreen: string;
	exitFullscreen: string;
	fullscreenOn: string;
}

export interface CapsuleSheetProps {
	/** The sheet's id, which the bar's orb controls. */
	id: string;
	labels: CapsuleLabels;
	/** What sits at the head's start: the view switch (public) or the title (admin). */
	start: Child;
	/** A Datastar `data-show` expression: the "new conversation" button shows while it is true. */
	newShow: string;
	/** The Datastar expression that clears the conversation. */
	onNew: string;
	/** An expression run whenever the body's state changes (asks for the kept conversation). */
	bodyEffect?: string;
	/** The sheet's body: the conversation (and, on the public sites, the destinations). */
	children: Child;
	/** Under the body, inside the sheet. */
	foot?: Child;
}

/** The scrim behind the sheet, and the sheet: head (start, new, full screen, close), body, foot. */
export function CapsuleSheet({
	id,
	labels,
	start,
	newShow,
	onNew,
	bodyEffect,
	children,
	foot,
}: CapsuleSheetProps): JSX.Element {
	return (
		<>
			<div
				class="pz-compass__scrim"
				style={{ display: "none" }}
				data-show="$compassOpen"
				data-on:click="$compassOpen = false"
			/>
			<div id={id} class="pz-compass__sheet" style={{ display: "none" }} data-show="$compassOpen">
				<div class="pz-compass__head">
					<span class="pz-compass__handle" aria-hidden="true" />
					{start}
					<button
						type="button"
						class="pz-compass__new"
						style={{ display: "none" }}
						data-show={newShow}
						data-on:click={onNew}
					>
						<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
							<path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" fill="none" />
						</svg>
						<span>{labels.newChat}</span>
					</button>
					<button
						type="button"
						class="pz-compass__fs"
						aria-pressed="false"
						aria-label={labels.fullscreen}
						data-enter={labels.fullscreen}
						data-exit={labels.exitFullscreen}
					>
						<svg
							class="pz-compass__fs-in"
							viewBox="0 0 20 20"
							width="18"
							height="18"
							aria-hidden="true"
						>
							<path
								d="M12 4h4v4M8 16H4v-4M16 4l-5 5M4 16l5-5"
								stroke="currentColor"
								stroke-width="1.8"
								fill="none"
							/>
						</svg>
						<svg
							class="pz-compass__fs-out"
							viewBox="0 0 20 20"
							width="18"
							height="18"
							aria-hidden="true"
						>
							<path
								d="M16 8h-4V4M4 12h4v4M12 8l5-5M8 12l-5 5"
								stroke="currentColor"
								stroke-width="1.8"
								fill="none"
							/>
						</svg>
					</button>
					<button
						type="button"
						class="pz-compass__close"
						aria-label={labels.close}
						data-on:click="$compassOpen = false"
					>
						<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
							<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" fill="none" />
						</svg>
					</button>
				</div>
				<div
					class="pz-compass__body"
					{...(bodyEffect === undefined ? {} : { "data-effect": bodyEffect })}
				>
					{children}
				</div>
				{foot}
			</div>
		</>
	);
}

/** Said once, politely, when the conversation goes full screen by itself. */
export function CapsuleLive({ text }: { text: string }): JSX.Element {
	return <p class="sr-only pz-compass__fs-live" role="status" aria-live="polite" data-on={text} />;
}

export interface CapsuleBarProps {
	/** The element the field's form controls (the conversation's live region). */
	answerId: string;
	/** The sheet the orb opens and closes. */
	sheetId: string;
	/** Accessible name of the orb. */
	toggleLabel: string;
	/** Accessible name and name of the send button. */
	sendLabel: string;
	/** The field. */
	field: {
		/** Accessible name. */
		label: string;
		/** The placeholder painted before Datastar takes over. */
		placeholder: string;
		/** A Datastar expression for the placeholder as it changes. */
		placeholderExpression: string;
		/** The signal the field is bound to, without the `$`. */
		bind: string;
		maxLength: number;
		/** Extra attributes (`data-cycle`, key and input handlers). */
		attributes?: Record<string, string>;
	};
	/** The key hint of the capsule, shown beside the field while it is empty. */
	kbd: string;
	/** The Datastar expression for submitting (Enter or the send button). */
	onSubmit: string;
	/** A custom event handler for questions handed over by a chip (`psi-guide-ask`). */
	onAsk?: string;
	/** Above the capsule's edge: the invitation label (public sites). */
	lead?: Child;
	/** The one primary action, beside the field. */
	action?: Child;
}

/** The capsule itself: the orb, the field, the key hint, the send button and the primary action. */
export function CapsuleBar({
	answerId,
	sheetId,
	toggleLabel,
	sendLabel,
	field,
	kbd,
	onSubmit,
	onAsk,
	lead,
	action,
}: CapsuleBarProps): JSX.Element {
	return (
		<form
			class="pz-compass__bar pz-edge"
			aria-controls={answerId}
			data-on:submit__prevent={onSubmit}
			{...(onAsk === undefined ? {} : { "data-on:psi-guide-ask": onAsk })}
		>
			{lead}
			<button
				type="button"
				class="pz-compass__orb"
				aria-label={toggleLabel}
				aria-expanded="false"
				aria-controls={sheetId}
				data-attr:aria-expanded="$compassOpen ? 'true' : 'false'"
				data-on:click="$compassOpen = !$compassOpen"
			/>
			<textarea
				class="pz-compass__input"
				name="compass"
				rows={1}
				maxlength={field.maxLength}
				data-bind={field.bind}
				placeholder={field.placeholder}
				data-attr:placeholder={field.placeholderExpression}
				aria-label={field.label}
				autocomplete="off"
				enterkeyhint="send"
				data-on:focus="$compassOpen = true"
				{...field.attributes}
			/>
			<span class="pz-compass__kbd" aria-hidden="true">
				{kbd}
			</span>
			<button
				type="submit"
				class="pz-compass__go"
				aria-label={sendLabel}
				data-attr:disabled={`$${field.bind}.trim() === ''`}
			>
				<ArrowIcon size={18} />
			</button>
			{action ? <span class="pz-compass__action">{action}</span> : null}
		</form>
	);
}
