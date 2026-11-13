/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { PanelCopy, StaffPage } from "@psi/engine/staff";
import type { JSX } from "hono/jsx/jsx-runtime";
import { STAFF_ASSISTANT_JS } from "./client.generated";
import { SaIcon } from "./icons";
import { jsString, sendExpression } from "./safe";

export interface StaffPanelProps {
	/** The panel's words, from the console's i18n (`staffCopy(locale).panel` fits). */
	labels: PanelCopy;
	/** Where `createStaffAssistantRoutes` is mounted, e.g. `/assistant`. */
	base: string;
	/** The screen the console is showing: the assistant answers about it ("this client"). */
	page: StaffPage;
	/** Up to three prompts that suit this screen (`engine.suggestions(screen, locale)`). */
	suggestions: ReadonlyArray<string>;
	/** One conversation per browser tab: a random id the console makes. */
	threadId: string;
	/** Draw the floating trigger too (default). The console puts `StaffTrigger` in its top bar and passes false. */
	trigger?: boolean;
}

/** The expression that opens or closes the panel, and asks for the day's briefing the first time. */
function toggleExpression(base: string): string {
	return `$staff.open = !$staff.open; if ($staff.open && !$staff.briefed) { $staff.briefed = true; @get(${jsString(`${base}/briefing`)}) }`;
}

export interface StaffTriggerProps {
	labels: PanelCopy;
	base: string;
	/** `bar`: a glowing pill for a top bar; `fab`: a floating button. */
	variant?: "bar" | "fab";
}

/** The button that opens the assistant (also reachable with Ctrl/Cmd+K). */
export function StaffTrigger({ labels, base, variant = "fab" }: StaffTriggerProps): JSX.Element {
	return (
		<button
			type="button"
			class={`sa-trigger sa-trigger--${variant}`}
			data-staff-trigger
			title={`${labels.title} (${labels.shortcut})`}
			aria-controls="staff-assistant"
			data-attr:aria-expanded="$staff.open ? 'true' : 'false'"
			data-on:click={toggleExpression(base)}
		>
			<SaIcon name="spark" />
			<span class="sa-trigger__label">{labels.title}</span>
			<kbd class="sa-trigger__key">{labels.shortcut}</kbd>
			<span class="sa-sr">{labels.open}</span>
		</button>
	);
}

/**
 * The staff assistant: a docked side panel on a desktop, a full-screen sheet on a phone, opened by
 * the trigger or Ctrl/Cmd+K. Server-rendered; Datastar posts the message and the server streams
 * the answer into the log as patches. Colours are token roles only.
 */
export function StaffPanel({
	labels,
	base,
	page,
	suggestions,
	threadId,
	trigger,
}: StaffPanelProps): JSX.Element {
	const signals = JSON.stringify({
		staff: { open: false, briefed: false, message: "", threadId, page },
	});
	return (
		<div class="sa-root" data-signals={signals}>
			{trigger === false ? null : <StaffTrigger labels={labels} base={base} />}
			<aside
				id="staff-assistant"
				class="sa"
				role="dialog"
				aria-label={labels.sheetLabel}
				data-class:is-open="$staff.open"
				data-attr:inert="!$staff.open"
			>
				<header class="sa__head">
					<span class="sa__mark">
						<SaIcon name="spark" />
					</span>
					<h2 class="sa__title">{labels.title}</h2>
					<button
						type="button"
						class="sa-icon-btn"
						title={labels.newChat}
						aria-label={labels.newChat}
						data-on:click="document.getElementById('staff-log').querySelectorAll('.sa-x').forEach((n) => n.remove()); $staff.threadId = crypto.randomUUID().replaceAll('-', '').slice(0, 24)"
					>
						<SaIcon name="plus" />
					</button>
					<button
						type="button"
						class="sa-icon-btn"
						title={labels.close}
						aria-label={labels.close}
						data-on:click="$staff.open = false"
					>
						<SaIcon name="close" />
					</button>
				</header>
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
							<button type="button" class="sa-chipbtn" data-on:click={sendExpression(base, text)}>
								{text}
							</button>
						))}
					</fieldset>
				)}
				<form
					class="sa__form"
					data-on:submit__prevent={`if ($staff.message.trim() !== '') @post(${jsString(`${base}/chat`)})`}
				>
					<textarea
						rows={1}
						maxlength={2000}
						class="sa__field"
						placeholder={labels.placeholder}
						aria-label={labels.placeholder}
						data-bind="staff.message"
					/>
					<button type="submit" class="sa-send" aria-label={labels.send} title={labels.send}>
						<SaIcon name="send" />
					</button>
				</form>
			</aside>
			<script dangerouslySetInnerHTML={{ __html: STAFF_ASSISTANT_JS }} />
		</div>
	);
}
