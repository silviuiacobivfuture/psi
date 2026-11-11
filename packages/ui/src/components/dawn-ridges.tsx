/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

const W = 1600;
const H = 900;
/** The sky above this line is left to the frame; the viewBox holds only the ranges. */
const TOP = 380;

/** Deterministic noise, so the server renders the same ridges on every request. */
function seeded(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

interface Ridge {
	seed: number;
	/** Baseline height of the ridge, in viewBox units from the top. */
	base: number;
	/** Rolling amplitude. */
	amp: number;
	/** Rock: how jagged the crest is. */
	jag: number;
	/** The summit: where it stands and how far it rises above the ridge. */
	peakX: number;
	peakH: number;
	peakW: number;
	/** How much lower the ridge sits at the left edge (where the words are) than at the right. */
	tilt: number;
}

function ridgePath({ seed, base, amp, jag, peakX, peakH, peakW, tilt }: Ridge): string {
	const r = seeded(seed);
	const [p1, p2, p3] = [r() * 6.28, r() * 6.28, r() * 6.28];
	let d = `M0 ${H}`;
	let crag = 0;
	for (let x = 0; x <= W; x += 12) {
		const roll =
			0.5 * Math.sin(x / 260 + p1) + 0.3 * Math.sin(x / 118 + p2) + 0.2 * Math.sin(x / 47 + p3);
		const dx = (x - peakX) / peakW;
		const summit = peakH * (0.62 * Math.exp(-2.4 * Math.abs(dx)) + 0.38 * Math.exp(-(dx ** 2)));
		crag = crag * 0.55 + (r() - 0.5) * jag;
		const lean = tilt * (1 - x / W);
		d += ` L${x} ${(base + lean - amp * roll - summit + crag).toFixed(1)}`;
	}
	return `${d} L${W} ${H} Z`;
}

/** Five ranges, far to near: the far ones pale with distance, the near one carries the ink. */
const RIDGES: ReadonlyArray<string> = [
	{ seed: 11, base: 560, amp: 24, jag: 7, peakX: 1180, peakH: 140, peakW: 230, tilt: 110 },
	{ seed: 23, base: 640, amp: 30, jag: 6, peakX: 820, peakH: 60, peakW: 240, tilt: 120 },
	{ seed: 37, base: 700, amp: 36, jag: 10, peakX: 1360, peakH: 150, peakW: 280, tilt: 90 },
	{ seed: 41, base: 776, amp: 26, jag: 9, peakX: 560, peakH: 36, peakW: 200, tilt: 40 },
	{ seed: 59, base: 846, amp: 20, jag: 7, peakX: 1480, peakH: 50, peakW: 260, tilt: 0 },
].map(ridgePath);

export interface DawnRidgesProps {
	/** Unique on the page: names the gradients. */
	id: string;
	class?: string;
}

/**
 * Layered mountain silhouettes with valley haze, the band at the bottom of a dawn.
 * Colours come from the theme: --hs-ridge-1..5 and --hs-haze (or --hs-haze-N for one layer).
 */
export function DawnRidges({ id, class: className }: DawnRidgesProps): JSX.Element {
	return (
		<svg
			class={cx("hs-ridges", className)}
			viewBox={`0 ${TOP} ${W} ${H - TOP}`}
			preserveAspectRatio="xMidYMax slice"
			aria-hidden="true"
			focusable="false"
		>
			<defs>
				{RIDGES.map((_, i) => (
					<linearGradient id={`${id}-r${i + 1}`} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0.38" style={{ stopColor: `var(--hs-ridge-${i + 1})` }} />
						<stop offset="1" style={{ stopColor: `var(--hs-haze-${i + 1}, var(--hs-haze))` }} />
					</linearGradient>
				))}
			</defs>
			{RIDGES.map((d, i) => (
				<path
					class={`hs-ridges__layer hs-ridges__layer--${i + 1}`}
					d={d}
					fill={`url(#${id}-r${i + 1})`}
				/>
			))}
		</svg>
	);
}
