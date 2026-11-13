/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { PanelCopy, StaffPage } from "@psi/engine/staff";
import type { JSX } from "hono/jsx/jsx-runtime";
import { CAPSULE_FULLSCREEN_JS } from "../client/compass-chat.generated";
import { CapsuleBar, CapsuleLive, CapsuleSheet } from "../components/capsule";
import { STAFF_ASSISTANT_JS } from "./client.generated";
import { SaIcon } from "./icons";
import { jsString } from "./safe";

export interface StaffCapsuleProps {
	/** The assistant's words, from the console's i18n (`staffCopy(locale).panel` fits). */
	labels: PanelCopy;
	/** Where `createStaffAssistantRoutes` is mounted, e.g. `/assistant`. */
	base: string;
	/** The screen the console is showing: the assistant answers about it ("this client"). */
	page: StaffPage;
	/** Up to three prompts that suit this screen. */
	suggestions: ReadonlyArray<string>;
	/** One conversation per browser tab: a random id the console makes. */
	threadId: string;
}

const SHEET_ID = "pz-staff-sheet";

/** The signals the capsule holds beside the staff ones: the sheet is up, and it always shows the conversation. */
function signalsOf(page: StaffPage, threadId: string): string {
	return JSON.stringify({
		compassOpen: false,
		compassChat: true,
		staff: { briefed: false, message: "", threadId, page },
	});
}

/** Asks for the day's briefing once, the first time the sheet is up. */
function briefOnOpen(base: string): string {
	return `if ($compassOpen && !$staff.briefed) { $staff.briefed = true; @get(${jsString(`${base}/briefing`)}) }`;
}

/** Ctrl or Cmd+K opens and closes the capsule; Escape closes it (full screen, first, is left by the page script). */
const KEYS =
	"if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'k') { evt.preventDefault(); $compassOpen = !$compassOpen; if ($compassOpen) el.querySelector('.pz-compass__input')?.focus() } else if (evt.key === 'Escape' && $compassOpen) { $compassOpen = false }";

/** A new conversation: the log empties and the thread changes; nothing else on the page is touched. */
const NEW_CHAT =
	"document.getElementById('staff-log').querySelectorAll('.sa-x').forEach((n) => n.remove()); $staff.threadId = crypto.randomUUID().replaceAll('-', '').slice(0, 24); $staff.message = ''; el.closest('.pz-compass').querySelector('.pz-compass__input')?.focus()";

/**
 * The staff assistant as the public sites' AI input: a glowing capsule at the foot of the screen
 * (page-aware placeholder), the conversation in a sheet above it, full screen with Escape and
 * after a minute of conversation. Same routes and same conversation as the side panel; only one
 * of the two is on a page. Colours are token roles of the admin theme.
 */
export function StaffCapsule({
	labels,
	base,
	page,
	suggestions,
	threadId,
}: StaffCapsuleProps): JSX.Element {
	return (
		<nav
			class="pz-compass pz-compass--admin sa-root"
			aria-label={labels.sheetLabel}
			data-signals={signalsOf(page, threadId)}
			data-class:is-open="$compassOpen"
			data-class:is-chat="$compassChat"
			data-on:keydown__window={KEYS}
		>
			<CapsuleSheet
				id={SHEET_ID}
				labels={{
					newChat: labels.newChat,
					close: labels.close,
					fullscreen: labels.fullscreen,
					exitFullscreen: labels.exitFullscreen,
					fullscreenOn: labels.fullscreenOn,
				}}
				newShow="true"
				onNew={NEW_CHAT}
				bodyEffect={briefOnOpen(base)}
				start={
					<h2 class="pz-compass__title">
						<span class="sa__mark">
							<SaIcon name="spark" />
						</span>
						{labels.title}
					</h2>
				}
			>
				<div
					id="staff-log"
					class="sa__log"
					role="log"
					aria-live="polite"
					aria-relevant="additions text"
				>
					<div class="sa-hello">
						<p class="sa-hello__title">{labels.empty}</p>
						<p>{labels.emptyHint}</p>
					</div>
					<section id="sa-briefing" aria-label={labels.title} />
				</div>
				{suggestions.length === 0 ? null : (
					<fieldset class="sa__suggest">
						<legend class="sa-sr">{labels.suggestions}</legend>
						{suggestions.slice(0, 3).map((text) => (
							<button
								type="button"
								class="sa-chipbtn"
								data-on:click={`$staff.message = ${jsString(text)}; @post(${jsString(`${base}/chat`)})`}
							>
								{text}
							</button>
						))}
					</fieldset>
				)}
			</CapsuleSheet>
			<CapsuleLive text={labels.fullscreenOn} />
			<CapsuleBar
				answerId="staff-log"
				sheetId={SHEET_ID}
				toggleLabel={labels.title}
				sendLabel={labels.send}
				kbd={labels.shortcut}
				onSubmit={`if ($staff.message.trim() !== '') { $compassOpen = true; @post(${jsString(`${base}/chat`)}) }`}
				field={{
					label: labels.title,
					placeholder: labels.placeholders[page.screen],
					placeholderExpression: jsString(labels.placeholders[page.screen]),
					bind: "staff.message",
					maxLength: 2000,
				}}
			/>
			<script dangerouslySetInnerHTML={{ __html: CAPSULE_FULLSCREEN_JS }} />
			<script dangerouslySetInnerHTML={{ __html: STAFF_ASSISTANT_JS }} />
		</nav>
	);
}
