/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface ProgressSignalProps {
	label: string;
	startLabel: string;
	endLabel: string;
	delta?: string;
	caption?: string;
	startNoise?: number;
	endNoise?: number;
	class?: string;
}

const W = 520;
const H = 120;

function wave(n: number, from: number, to: number): string {
	const pts: Array<[number, number]> = [];
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		const amp = ((from + (to - from) * t ** 1.4) * H) / 2;
		const y = H / 2 + Math.sin(i * 1.7) * amp * (0.6 + 0.4 * Math.sin(i * 0.53 + 1));
		pts.push([t * W, y]);
	}
	// A smooth curve through the samples: each segment ends at the midpoint of two samples.
	let d = `M${pts[0]?.[0].toFixed(1)},${pts[0]?.[1].toFixed(1)}`;
	for (let i = 1; i < pts.length - 1; i++) {
		const [x, y] = pts[i] ?? [0, 0];
		const [nx, ny] = pts[i + 1] ?? [x, y];
		d += ` Q${x.toFixed(1)},${y.toFixed(1)} ${((x + nx) / 2).toFixed(1)},${((y + ny) / 2).toFixed(1)}`;
	}
	const last = pts[pts.length - 1] ?? [W, H / 2];
	return `${d} T${last[0].toFixed(1)},${last[1].toFixed(1)}`;
}

/** The promise made visible: a noisy signal settling into calm. */
export function ProgressSignal({
	label,
	startLabel,
	endLabel,
	delta,
	caption,
	startNoise = 0.9,
	endNoise = 0.18,
	class: className,
}: ProgressSignalProps): JSX.Element {
	return (
		<figure class={cx("pz-signal", className)} style={{ margin: "0" }}>
			<div class="pz-signal__head">
				<span class="pz-signal__label">{label}</span>
				{delta ? <span class="pz-signal__delta">{delta}</span> : null}
			</div>
			<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={delta ? `${label}: ${delta}` : label}>
				<defs>
					<linearGradient id="pz-signal-ink" x1="0" x2="1" y1="0" y2="0">
						<stop offset="0" stop-color="var(--glow-3)" />
						<stop offset=".45" stop-color="var(--glow-2)" />
						<stop offset="1" stop-color="var(--glow-1)" />
					</linearGradient>
				</defs>
				<line class="pz-signal__base" x1="0" x2={W} y1={H / 2} y2={H / 2} />
				<path
					class="pz-signal__line"
					pathLength="1"
					stroke="url(#pz-signal-ink)"
					d={wave(48, startNoise, endNoise)}
				/>
				<circle class="pz-signal__dot" cx={W} cy={H / 2} r="5" />
			</svg>
			<div class="pz-signal__axis">
				<span>{startLabel}</span>
				<span>{endLabel}</span>
			</div>
			{caption ? <figcaption class="pz-signal__caption">{caption}</figcaption> : null}
		</figure>
	);
}
