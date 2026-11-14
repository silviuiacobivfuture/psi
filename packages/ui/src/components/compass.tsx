/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { COMPASS_CHAT_JS } from "../client/compass-chat.generated";
import { cx } from "../cx";
import {
	askEvent,
	KEYS,
	load,
	PICK,
	reset,
	restoreOnOpen,
	SIGNALS,
	save,
	send,
	submit,
	suggest,
	UNPICK,
} from "./compass-actions";
import { type CompassInvite, InviteLabel, Nudge } from "./compass-invite";
import { type CompassGroup, matches, STAFF_KEYWORDS, staffFilter } from "./compass-match";
import { jsString } from "./guide-exchange";
import { GuideMessage } from "./guide-message";
import { ArrowIcon } from "./icons";

export type { CompassInvite, CompassNudge } from "./compass-invite";
export {
	type CompassGroup,
	type CompassItem,
	destinationWords,
	fold,
	matchExpression,
	matchesDestination,
	queryWords,
	STAFF_KEYWORDS,
} from "./compass-match";

/** Every word of the chat inside the compass, from the app's own i18n. */
export interface CompassChatLabels {
	/** The guide's first line in an empty conversation. */
	greeting: string;
	/** Once, above the conversation: answers come from reviewed content and replace no consult. */
	disclaimer: string;
	newChat: string;
	close: string;
	/** The two views of the sheet, and the name of the switch between them. */
	guideTab: string;
	pagesTab: string;
	views: string;
	/** The pill that brings a reader who scrolled up back to the newest message. */
	newMessage: string;
	/** The field's placeholder while the chat shows. */
	placeholder: string;
	/** Above the example questions among the destinations. */
	suggestions: string;
	/** Under a question whose answer never arrived, and the button that asks it again. */
	dropped: string;
	retry: string;
	/** Under a question a newer one replaced before any answer arrived. */
	unanswered: string;
	/** The head's toggle (its name stays the same, `aria-pressed` tells the state), and what is said on the automatic entry. */
	fullscreen: string;
	fullscreenOn: string;
}

export interface CompassChat {
	/** Where this site keeps the conversation in the browser: one key per brand. */
	storageKey: string;
	/** The guide's example questions: quick replies on an empty conversation. */
	suggestions: ReadonlyArray<string>;
	labels: CompassChatLabels;
}

export interface CompassProps {
	/** Accessible name of the whole control. */
	label: string;
	placeholder: string;
	/** Accessible name of the orb that opens and closes the sheet. */
	toggleLabel: string;
	/** The ask row while something is typed (Enter asks the guide), and the send button's name. */
	askHint: string;
	groups: ReadonlyArray<CompassGroup>;
	/** Where questions, restores and resets go (`/ghid?target=compass-answer`, see `answerGuidePost`). */
	guideAction: string;
	answerId: string;
	chat: CompassChat;
	/** The one primary action, beside the field. */
	action?: Child;
	/** Language, theme and other quiet controls, under the destinations. */
	tools?: Child;
	/**
	 * Where to ask, the first time the sheet opens, for the staff-only group (`/__admin/compass`):
	 * the page itself never reads the session; the answer is empty for everyone but staff.
	 */
	staffLink?: string;
	/** The only words the staff group's "Administrare" link answers to. */
	staffKeywords?: ReadonlyArray<string>;
	/**
	 * A message the page asks the guide as the visitor's own when it loads, opening the chat: the
	 * way another psi site hands a booking over (`?ghid=programare`). The app builds it from a
	 * validated query, never from free text.
	 */
	startWith?: string;
	/**
	 * What makes the capsule noticed: its label, the example questions the field cycles through and
	 * the page's one nudge (the first placeholder replaces `placeholder` on screen; `placeholder`
	 * stays the field's accessible name).
	 */
	invite?: CompassInvite;
	/**
	 * The visitor's own words that the action asks the guide: with it, a click on the action opens
	 * the chat in full screen and asks them, so the booking starts in the conversation; without it,
	 * or without script, the action is its plain link.
	 */
	bookWith?: string;
	class?: string;
}

/** The example questions, as chips that ask through the field's form. */
function Suggestions({ chat }: { chat: CompassChat }): JSX.Element | null {
	if (chat.suggestions.length === 0) return null;
	return (
		<div class="pz-compass__chips">
			{chat.suggestions.map((s) => (
				<button type="button" class="pz-chip pz-compass__chip" data-on:click={suggest(s)}>
					{s}
				</button>
			))}
		</div>
	);
}

/** The destinations, filtered as the field is typed in; the ask row first. */
function Destinations({
	askHint,
	groups,
	chat,
	staffLink,
	staffKeywords,
}: Pick<CompassProps, "askHint" | "groups" | "chat" | "staffLink"> & {
	staffKeywords: ReadonlyArray<string>;
}): JSX.Element {
	const empty = "$compassTurns.length === 0 && $compassPending === ''";
	return (
		<div class="pz-compass__pages" data-show="!$compassChat">
			<section
				class="pz-compass__ask-group"
				style={{ display: "none" }}
				data-show={`${empty} && $compassQuery.trim() === ''`}
			>
				<h2 class="pz-compass__group-label">{chat.labels.suggestions}</h2>
				<Suggestions chat={chat} />
			</section>
			{/* The default row: Enter asks the guide. The arrow keys move on to the destinations. */}
			<button
				type="button"
				id="pz-compass-ask"
				class="pz-compass__ask"
				style={{ display: "none" }}
				data-show="$compassQuery.trim() !== ''"
				data-on:click={`${UNPICK}; el.closest('.pz-compass').querySelector('.pz-compass__bar').requestSubmit()`}
			>
				<kbd>↵</kbd> {askHint}
			</button>
			<div class="pz-compass__groups">
				{groups.map((g, gi) => (
					<section
						class="pz-compass__group"
						data-show={g.items.map((item) => `(${matches(item)})`).join(" || ") || "false"}
					>
						<h2 class="pz-compass__group-label">{g.label}</h2>
						<ul>
							{g.items.map((item, i) => (
								<li>
									<a
										id={`pz-dest-${gi}-${i}`}
										class="pz-compass__item"
										href={item.href}
										data-show={matches(item)}
									>
										<span>{item.label}</span>
										{item.hint ? <small>{item.hint}</small> : null}
									</a>
								</li>
							))}
						</ul>
					</section>
				))}
				{staffLink ? (
					<div
						class="pz-compass__staff"
						data-init={staffFilter(staffKeywords)}
						data-effect="$compassQuery; el.psiFilter?.()"
					>
						<section
							id="pz-compass-staff"
							style={{ display: "none" }}
							data-effect={`if ($compassOpen && !el.dataset.asked) { el.dataset.asked = '1'; @get(${JSON.stringify(staffLink).replaceAll('"', "'")}, {retry: 'never'}) }`}
						/>
					</div>
				) : null}
			</div>
		</div>
	);
}

/**
 * The compass: psi's navigation without a navbar, and the guide's chat. One floating capsule at
 * the foot of the screen — the orb, one field, the primary action — and a sheet above it with two
 * views: the chat with the guide, and the destinations (which filter as you type: every word must
 * start a word of the destination). Enter always asks the guide; a destination opens only when
 * picked (a click, or the arrow keys then Enter).
 *
 * The conversation is the page's: it survives collapsing the sheet, clicking outside, another page
 * of the site and a reload (kept per brand in the browser, restored through the guide route), and
 * only "New conversation" clears it. Escape, the close button and the scrim only collapse; in full screen Escape first leaves it.
 */
export function Compass({
	label,
	placeholder,
	toggleLabel,
	askHint,
	groups,
	guideAction,
	answerId,
	chat,
	action,
	tools,
	staffLink,
	staffKeywords = STAFF_KEYWORDS,
	startWith,
	invite,
	bookWith,
	class: className,
}: CompassProps): JSX.Element {
	const { labels } = chat;
	const shown = invite?.placeholders[0] ?? placeholder;
	const placeholders = `$compassChat ? ${JSON.stringify(labels.placeholder)} : ${JSON.stringify(shown)}`;
	return (
		<nav
			class={cx("pz-compass", className)}
			aria-label={label}
			{...(invite === undefined
				? {}
				: {
						"data-invite-key": chat.storageKey,
						...(invite.signalUrl === undefined ? {} : { "data-signal-url": invite.signalUrl }),
					})}
			data-signals={SIGNALS}
			data-init={
				startWith === undefined
					? load(guideAction, chat.storageKey)
					: `${load(guideAction, chat.storageKey)}; ${send(guideAction, jsString(startWith), false)}`
			}
			data-effect={save(chat.storageKey)}
			data-class:is-open="$compassOpen"
			data-class:is-chat="$compassChat"
			data-on:keydown__window={KEYS}
		>
			<div
				class="pz-compass__scrim"
				style={{ display: "none" }}
				data-show="$compassOpen"
				data-on:click="$compassOpen = false"
			/>
			<div
				id="pz-compass-sheet"
				class="pz-compass__sheet"
				style={{ display: "none" }}
				data-show="$compassOpen"
			>
				<div class="pz-compass__head">
					<span class="pz-compass__handle" aria-hidden="true" />
					<fieldset class="pz-compass__views">
						<legend class="sr-only">{labels.views}</legend>
						<button
							type="button"
							class="pz-compass__view"
							aria-pressed="false"
							data-attr:aria-pressed="$compassChat ? 'true' : 'false'"
							data-on:click="$compassChat = true"
						>
							{labels.guideTab}
						</button>
						<button
							type="button"
							class="pz-compass__view"
							aria-pressed="true"
							data-attr:aria-pressed="$compassChat ? 'false' : 'true'"
							data-on:click="$compassChat = false"
						>
							{labels.pagesTab}
						</button>
					</fieldset>
					<button
						type="button"
						class="pz-compass__new"
						style={{ display: "none" }}
						data-show="$compassTurns.length > 0 || $compassPending !== ''"
						data-on:click={reset(guideAction, chat.storageKey, answerId)}
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
				<div class="pz-compass__body" data-effect={restoreOnOpen(guideAction)}>
					<Destinations
						askHint={askHint}
						groups={groups}
						chat={chat}
						{...(staffLink === undefined ? {} : { staffLink })}
						staffKeywords={staffKeywords}
					/>
					<div class="pz-compass__chat" style={{ display: "none" }} data-show="$compassChat">
						<p class="pz-compass__disclaimer">{labels.disclaimer}</p>
						<div
							class="pz-compass__empty"
							data-show="$compassTurns.length === 0 && $compassPending === ''"
						>
							<GuideMessage>{labels.greeting}</GuideMessage>
							<Suggestions chat={chat} />
						</div>
						<div id={answerId} class="pz-compass__answer" role="log" aria-live="polite" />
					</div>
					<button type="button" class="pz-compass__pill" hidden>
						<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
							<path
								d="M10 4v11M5 10l5 5 5-5"
								stroke="currentColor"
								stroke-width="1.8"
								fill="none"
							/>
						</svg>
						{labels.newMessage}
					</button>
				</div>
				{tools ? (
					<div class="pz-compass__tools" data-show="!$compassChat">
						{tools}
					</div>
				) : null}
			</div>
			{/* Said once, politely, when the chat goes full screen by itself. */}
			<p
				class="sr-only pz-compass__fs-live"
				role="status"
				aria-live="polite"
				data-on={labels.fullscreenOn}
			/>
			{invite?.nudge ? <Nudge nudge={invite.nudge} /> : null}
			<form
				class="pz-compass__bar pz-edge"
				aria-controls={answerId}
				data-on:submit__prevent={submit(guideAction)}
				data-on:psi-guide-ask={askEvent(guideAction)}
			>
				{invite ? <InviteLabel label={invite.label} /> : null}
				<button
					type="button"
					class="pz-compass__orb"
					aria-label={toggleLabel}
					aria-expanded="false"
					aria-controls="pz-compass-sheet"
					data-attr:aria-expanded="$compassOpen ? 'true' : 'false'"
					data-on:click="$compassOpen = !$compassOpen"
				/>
				<textarea
					class="pz-compass__input"
					name="compass"
					rows={1}
					maxlength={500}
					data-bind="compassQuery"
					placeholder={shown}
					{...(invite !== undefined && invite.placeholders.length > 1
						? { "data-cycle": JSON.stringify(invite.placeholders) }
						: {})}
					data-attr:placeholder={placeholders}
					aria-label={placeholder}
					autocomplete="off"
					enterkeyhint="send"
					data-on:focus="$compassOpen = true"
					data-on:keydown={PICK}
					data-on:input={UNPICK}
				/>
				<span class="pz-compass__kbd" aria-hidden="true">
					/
				</span>
				<button
					type="submit"
					class="pz-compass__go"
					aria-label={askHint}
					data-attr:disabled="$compassQuery.trim() === ''"
				>
					<ArrowIcon size={18} />
				</button>
				{action ? (
					<span
						class="pz-compass__action"
						{...(bookWith === undefined ? {} : { "data-book": bookWith })}
					>
						{action}
					</span>
				) : null}
			</form>
			{/* What the page shows itself when a question never reached the guide (no exchange came back). */}
			<template class="pz-compass__unsent">
				<div class="pz-exchange" aria-busy="false">
					<GuideMessage from="user" />
					<p
						class="pz-exchange__note"
						data-dropped={labels.dropped}
						data-unanswered={labels.unanswered}
					>
						<span />
						<button type="button" class="pz-exchange__retry">
							{labels.retry}
						</button>
					</p>
				</div>
			</template>
			<script dangerouslySetInnerHTML={{ __html: COMPASS_CHAT_JS }} />
		</nav>
	);
}
