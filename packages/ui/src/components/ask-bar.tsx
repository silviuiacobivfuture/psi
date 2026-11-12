/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { PageTarget } from "@psi/guide";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { ArrowIcon } from "./icons";

export interface AskBarProps {
	/** Endpoint that streams the guide's answer (Datastar SSE patch into `#${target}`). */
	action: string;
	/** Id of the element the answer is patched into. */
	target: string;
	label: string;
	placeholder: string;
	sendLabel: string;
	suggestions?: ReadonlyArray<string>;
	/**
	 * What page this bar is on, when the page knows (an article's slug, a hub's or a method's id).
	 * Sent with every question as a reference the server looks up itself; the page's path goes with
	 * it either way, so a bar on any page tells the guide where the visitor is.
	 */
	page?: PageTarget;
	class?: string;
}

/** The signal that carries the page reference: the path from the browser, the target from the server. */
export function pageSignal(page: PageTarget | undefined): string {
	const target =
		page === undefined
			? ""
			: page.kind === "article"
				? `, kind: ${JSON.stringify(page.kind)}, slug: ${JSON.stringify(page.slug)}`
				: `, kind: ${JSON.stringify(page.kind)}, id: ${JSON.stringify(page.id)}`;
	return `{guideTurns: [], guidePage: {path: window.location.pathname${target}}}`;
}

/** The AI guide's entry: one question in, an answer streamed back by the server. */
export function AskBar({
	action,
	target,
	label,
	placeholder,
	sendLabel,
	suggestions = [],
	page,
	class: className,
}: AskBarProps): JSX.Element {
	// Never retried: a retry would re-post the emptied field. A dropped stream shows the
	// answer region's own fallback instead (see `GuideAnswer`).
	const post = `@post('${action}', {retry: 'never'})`;
	return (
		<search>
			<form
				class={cx("pz-ask", className)}
				data-signals:question__ifmissing="''"
				data-signals__ifmissing={pageSignal(page)}
				data-on:submit__prevent={`$question.trim() && ${post}`}
				data-on:psi-guide-ask={`$question = evt.detail; ${post}`}
				data-indicator="asking"
				aria-controls={target}
			>
				<div class="pz-ask__bar" data-class:is-asking="$asking">
					<span class="pz-ask__orb" aria-hidden="true" />
					<input
						class="pz-ask__input"
						name="question"
						data-bind="question"
						placeholder={placeholder}
						aria-label={label}
						autocomplete="off"
						enterkeyhint="send"
					/>
					<button
						type="submit"
						class="pz-ask__send"
						aria-label={sendLabel}
						data-attr:disabled="$asking"
					>
						<ArrowIcon size={20} />
					</button>
				</div>
				{suggestions.length > 0 ? (
					<div class="pz-ask__chips">
						{suggestions.map((s) => (
							<button
								type="button"
								class="pz-chip"
								aria-pressed="false"
								data-on:click={`$question = ${JSON.stringify(s)}; ${post}`}
							>
								{s}
							</button>
						))}
					</div>
				) : null}
			</form>
		</search>
	);
}
