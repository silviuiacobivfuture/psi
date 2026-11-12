/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface GuideSource {
	label: string;
	/** Absent: the source is cited by its label only (no link). */
	href?: string;
}

/** A next step under a guide message: a link, or a click that asks the conversation something. */
export interface GuideMessageAction {
	label: string;
	/** A link. */
	href?: string;
	/** A Datastar expression run on click (used when there is no `href`). */
	onClick?: string;
}

export interface GuideMessageProps {
	/** Who speaks this turn. */
	from?: "guide" | "user";
	sources?: ReadonlyArray<GuideSource>;
	/** The next steps the reply earned, as buttons. */
	actions?: ReadonlyArray<GuideMessageAction>;
	id?: string;
	class?: string;
	children?: Child;
}

/** One turn of the conversation with the guide; the guide's turns cite the pages they used. */
export function GuideMessage({
	from = "guide",
	sources = [],
	actions = [],
	id,
	class: className,
	children,
}: GuideMessageProps): JSX.Element {
	return (
		<div id={id} class={cx("pz-msg", `pz-msg--${from}`, className)}>
			{from === "guide" ? <span class="pz-msg__avatar" aria-hidden="true" /> : null}
			<div class="pz-msg__bubble">
				{children}
				{actions.length > 0 ? (
					<div class="pz-msg__actions">
						{actions.map((a) =>
							a.href === undefined ? (
								<button
									type="button"
									class="pz-btn pz-btn--primary pz-msg__action"
									data-on:click={a.onClick}
								>
									{a.label}
								</button>
							) : (
								<a class="pz-btn pz-btn--primary pz-msg__action" href={a.href}>
									{a.label}
								</a>
							),
						)}
					</div>
				) : null}
				{sources.length > 0 ? (
					<div class="pz-msg__sources">
						{sources.map((s) =>
							s.href === undefined ? (
								<span class="pz-msg__source">{s.label}</span>
							) : (
								<a class="pz-msg__source" href={s.href}>
									{s.label}
								</a>
							),
						)}
					</div>
				) : null}
			</div>
		</div>
	);
}
