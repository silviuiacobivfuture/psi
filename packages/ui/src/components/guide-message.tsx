/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface GuideSource {
	label: string;
	href: string;
}

export interface GuideMessageProps {
	/** Who speaks this turn. */
	from?: "guide" | "user";
	sources?: ReadonlyArray<GuideSource>;
	id?: string;
	class?: string;
	children?: Child;
}

/** One turn of the conversation with the guide; the guide's turns cite the pages they used. */
export function GuideMessage({
	from = "guide",
	sources = [],
	id,
	class: className,
	children,
}: GuideMessageProps): JSX.Element {
	return (
		<div id={id} class={cx("pz-msg", `pz-msg--${from}`, className)}>
			{from === "guide" ? <span class="pz-msg__avatar" aria-hidden="true" /> : null}
			<div class="pz-msg__bubble">
				{children}
				{sources.length > 0 ? (
					<div class="pz-msg__sources">
						{sources.map((s) => (
							<a class="pz-msg__source" href={s.href}>
								{s.label}
							</a>
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}
