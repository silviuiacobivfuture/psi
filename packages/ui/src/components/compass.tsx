/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { ArrowIcon } from "./icons";

export interface CompassItem {
	label: string;
	href: string;
	hint?: string;
}

export interface CompassGroup {
	label: string;
	items: ReadonlyArray<CompassItem>;
}

export interface CompassProps {
	/** Accessible name of the whole control. */
	label: string;
	placeholder: string;
	/** Accessible name of the orb that opens and closes the sheet. */
	toggleLabel: string;
	/** Shown under the destinations while something is typed: Enter asks the guide. */
	askHint: string;
	groups: ReadonlyArray<CompassGroup>;
	/** Where a question goes when no destination matches (streams into `#${answerId}`). */
	guideAction: string;
	answerId: string;
	/** The one primary action, beside the field. */
	action?: Child;
	/** Language, theme and other quiet controls, inside the sheet. */
	tools?: Child;
	class?: string;
}

/** Folds case and Romanian diacritics, so "integrare" finds "Integrare senzorială" and "adulti" finds "Adulți". */
export function fold(text: string): string {
	return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** The same folding, as a Datastar expression over the typed query. */
const QUERY =
	"$compassQuery.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim()";

function matches(item: CompassItem, group: CompassGroup): string {
	const haystack = JSON.stringify(fold(`${item.label} ${item.hint ?? ""} ${group.label}`));
	return `!${QUERY} || ${haystack}.includes(${QUERY})`;
}

/**
 * The compass: psi's navigation without a navbar. One floating capsule at the foot of the screen:
 * the orb, one field that either goes somewhere or asks the guide, and the primary action. Focus
 * (or "/") opens a sheet of destinations that filter as you type; Enter goes to the first match,
 * or, when nothing matches, asks the guide and streams the answer into the sheet.
 */
export function Compass({
	label,
	placeholder,
	toggleLabel,
	askHint,
	groups,
	guideAction,
	answerId,
	action,
	tools,
	class: className,
}: CompassProps): JSX.Element {
	const firstMatch =
		"el.closest('.pz-compass').querySelector('.pz-compass__item:not([style*=\"display: none\"])')";
	/** Keeps the newest message in view: the sheet scrolls to its end as the answer streams in. */
	const FOLLOW_ANSWER =
		"new MutationObserver(() => { el.scrollTop = el.scrollHeight }).observe(el.querySelector('.pz-compass__answer'), { childList: true, subtree: true, characterData: true })";
	const submit = [
		`const q = ${QUERY}`,
		`const a = ${firstMatch}`,
		`if (q && a) { window.location.href = a.href } else if (q) { $compassOpen = true; $compassChat = true; @post('${guideAction}') }`,
	].join("; ");
	const keys = [
		"if (evt.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')) { evt.preventDefault(); $compassOpen = true; el.querySelector('.pz-compass__input').focus() }",
		"else if (evt.key === 'Escape') { $compassOpen = false }",
	].join(" ");
	return (
		<nav
			class={cx("pz-compass", className)}
			aria-label={label}
			data-signals="{compassOpen: false, compassQuery: '', compassChat: false}"
			data-class:is-open="$compassOpen"
			data-on:keydown__window={keys}
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
				data-init={FOLLOW_ANSWER}
			>
				{/* During a conversation the destinations step aside; typing brings matching ones back. */}
				<div class="pz-compass__groups" data-show="!$compassChat || $compassQuery.trim() !== ''">
					{groups.map((g) => (
						<section
							class="pz-compass__group"
							data-show={g.items.map((item) => `(${matches(item, g)})`).join(" || ") || "false"}
						>
							<h2 class="pz-compass__group-label">{g.label}</h2>
							<ul>
								{g.items.map((item) => (
									<li>
										<a class="pz-compass__item" href={item.href} data-show={matches(item, g)}>
											<span>{item.label}</span>
											{item.hint ? <small>{item.hint}</small> : null}
										</a>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
				<p
					class="pz-compass__ask"
					style={{ display: "none" }}
					data-show="$compassQuery.trim() !== ''"
				>
					<kbd>↵</kbd> {askHint}
				</p>
				<div id={answerId} class="pz-compass__answer" aria-live="polite" />
				{tools ? <div class="pz-compass__tools">{tools}</div> : null}
			</div>
			<form class="pz-compass__bar pz-edge" data-on:submit__prevent={submit}>
				<button
					type="button"
					class="pz-compass__orb"
					aria-label={toggleLabel}
					aria-expanded="false"
					aria-controls="pz-compass-sheet"
					data-attr:aria-expanded="$compassOpen ? 'true' : 'false'"
					data-on:click="$compassOpen = !$compassOpen"
				/>
				<input
					class="pz-compass__input"
					name="compass"
					data-bind="compassQuery"
					placeholder={placeholder}
					aria-label={placeholder}
					autocomplete="off"
					data-on:focus="$compassOpen = true"
				/>
				<span class="pz-compass__kbd" aria-hidden="true">
					/
				</span>
				<button type="submit" class="pz-compass__go" aria-label={askHint}>
					<ArrowIcon size={18} />
				</button>
				{action ? <span class="pz-compass__action">{action}</span> : null}
			</form>
		</nav>
	);
}
