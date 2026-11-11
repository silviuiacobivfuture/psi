/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface SoundWavesProps {
	/** Height in px of the strip; the waves stretch to the full width. */
	height?: number;
	class?: string;
}

/** One period is 600 user units (a crest and a trough); six of them, so a 600-unit slide loops seamlessly. */
function wave(amplitude: number): string {
	let d = `M0 80q150 ${-amplitude} 300 0`;
	for (let i = 0; i < 5; i++) d += "t300 0";
	return d;
}

const GOLD = wave(70);
const TEAL = wave(-50);
const FAINT = wave(28);

/** EQ-SYNC's signature: hairline sound waves (gold and teal) drifting slowly; still under reduced motion. Decorative. */
export function SoundWaves({ height = 160, class: className }: SoundWavesProps): JSX.Element {
	return (
		<svg
			class={cx("pz-waves", className)}
			style={{ height: `${height}px` }}
			viewBox="0 0 1200 160"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<path class="pz-waves__w pz-waves__w--faint" d={FAINT} />
			<path class="pz-waves__w pz-waves__w--teal" d={TEAL} />
			<path class="pz-waves__w pz-waves__w--gold" d={GOLD} />
		</svg>
	);
}
