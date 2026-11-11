/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface FocusLevel {
	/** The number of the level, e.g. 10. */
	level: number;
	/** The word before the number, e.g. "Focus". */
	label: string;
	name: string;
	text: string;
}

export interface FocusScaleProps {
	/** Accessible name of the list. */
	label: string;
	levels: ReadonlyArray<FocusLevel>;
	/** The level shown as active (violet) until the visitor points at another. */
	active?: number;
	class?: string;
}

/**
 * The Focus levels as a quiet scale: a hairline that deepens towards violet, one stop per level.
 * Named states, not a hierarchy. Pointing at a level lights it; CSS only.
 */
export function FocusScale({
	label,
	levels,
	active,
	class: className,
}: FocusScaleProps): JSX.Element {
	return (
		<ol class={cx("hs-focus", className)} aria-label={label}>
			{levels.map((l, i) => (
				<li
					class={cx("hs-focus__step", l.level === active && "is-active")}
					style={{ "--hs-step": String(i) }}
					aria-current={l.level === active ? "step" : undefined}
				>
					<span class="hs-focus__dot" aria-hidden="true" />
					<span class="hs-focus__num">
						<small>{l.label}</small>
						{l.level}
					</span>
					<span class="hs-focus__name">{l.name}</span>
					<span class="hs-focus__text">{l.text}</span>
				</li>
			))}
		</ol>
	);
}
