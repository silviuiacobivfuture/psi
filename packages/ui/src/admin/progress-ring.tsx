/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";

/** The four parts of a session ring, in the order they are drawn. */
export type RingTone = "used" | "left" | "bonus-used" | "bonus-left";

export interface RingSegment {
	tone: RingTone;
	value: number;
}

export interface ProgressRingProps {
	segments: ReadonlyArray<RingSegment>;
	/** Spoken once for the whole ring ("7 of 10 sessions left, 1 bonus"). */
	label: string;
	/** The big figure in the middle ("7"). */
	primary: string;
	/** The line under it ("din 10"). */
	secondary?: string;
	size?: number;
}

const R = 42;
const C = 2 * Math.PI * R;
/** A hairline between neighbouring segments, in circumference units. */
const GAP = 2.4;

/** Arc lengths for the segments: whole sessions share the circle; a lone segment has no gap. */
export function ringArcs(
	segments: ReadonlyArray<RingSegment>,
): ReadonlyArray<{ tone: RingTone; dash: number; offset: number }> {
	const live = segments.filter((s) => s.value > 0);
	const total = live.reduce((sum, s) => sum + s.value, 0);
	if (total <= 0) return [];
	const gap = live.length > 1 ? GAP : 0;
	let at = 0;
	return live.map((s) => {
		const len = (s.value / total) * C;
		const arc = { tone: s.tone, dash: Math.max(0.1, len - gap), offset: -at };
		at += len;
		return arc;
	});
}

/** Sessions as a ring: used, left, and the bonus as its own colour. Colour never carries it alone: the label does. */
export function ProgressRing({
	segments,
	label,
	primary,
	secondary,
	size,
}: ProgressRingProps): JSX.Element {
	return (
		<div
			class="adm-ring"
			style={size === undefined ? undefined : `--ring:${size}px`}
			role="img"
			aria-label={label}
		>
			<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
				<circle class="adm-ring__track" cx="50" cy="50" r={R} />
				{ringArcs(segments).map((a) => (
					<circle
						key={a.tone}
						class={`adm-ring__seg adm-ring__seg--${a.tone}`}
						cx="50"
						cy="50"
						r={R}
						stroke-dasharray={`${a.dash.toFixed(2)} ${(C - a.dash).toFixed(2)}`}
						stroke-dashoffset={a.offset.toFixed(2)}
					/>
				))}
			</svg>
			<div class="adm-ring__center" aria-hidden="true">
				<span class="adm-ring__primary">{primary}</span>
				{secondary === undefined ? null : <span class="adm-ring__secondary">{secondary}</span>}
			</div>
		</div>
	);
}
