import type { JSX } from "hono/jsx/jsx-runtime";

/**
 * Charts are plain server-rendered SVG: shapes take their colour from the design tokens through the `stat-*` classes
 * (so light and dark follow the theme), each carries a title and a description, and the same numbers always sit in a
 * table beside it. Nothing here needs a script.
 */

const niceMax = (n: number): number => {
	if (n <= 4) return 4;
	const step = 10 ** Math.floor(Math.log10(n));
	return Math.ceil(n / step) * step;
};

export interface Column {
	label: string;
	value: number;
	/** The same slot of the comparison period, when asked. */
	previous?: number;
}

const W = 420;
const BARS_W = 360;
const HEAT_W = 640;
const H = 220;
const LEFT = 36;
const BOTTOM = 26;
const TOP = 10;

/** Vertical columns, one per day or week, with the comparison period as a dashed line over them. */
export function Columns({
	columns,
	title,
	desc,
}: {
	columns: ReadonlyArray<Column>;
	title: string;
	desc: string;
}): JSX.Element {
	const max = niceMax(Math.max(1, ...columns.flatMap((c) => [c.value, c.previous ?? 0])));
	const plotH = H - TOP - BOTTOM;
	const slot = (W - LEFT - 8) / Math.max(1, columns.length);
	const y = (v: number): number => TOP + plotH - (v / max) * plotH;
	const every = Math.max(1, Math.ceil(columns.length / 10));
	const hasPrevious = columns.some((c) => c.previous !== undefined);
	const line = columns
		.map((c, i) => `${(LEFT + slot * (i + 0.5)).toFixed(1)},${y(c.previous ?? 0).toFixed(1)}`)
		.join(" ");
	return (
		<svg
			class="stat-svg"
			viewBox={`0 0 ${W} ${H}`}
			role="img"
			aria-labelledby="stat-trend-t stat-trend-d"
		>
			<title id="stat-trend-t">{title}</title>
			<desc id="stat-trend-d">{desc}</desc>
			{[0, 0.25, 0.5, 0.75, 1].map((f) => (
				<g key={f}>
					<line class="stat-grid" x1={LEFT} x2={W - 8} y1={y(max * f)} y2={y(max * f)} />
					<text class="stat-axis" x={LEFT - 6} y={y(max * f) + 4} text-anchor="end">
						{Math.round(max * f)}
					</text>
				</g>
			))}
			{columns.map((c, i) => (
				<g key={c.label}>
					<rect
						class="stat-bar"
						x={LEFT + slot * i + slot * 0.15}
						y={y(c.value)}
						width={slot * 0.7}
						height={Math.max(0, TOP + plotH - y(c.value))}
						rx="2"
					/>
					{i % every === 0 ? (
						<text class="stat-axis" x={LEFT + slot * (i + 0.5)} y={H - 8} text-anchor="middle">
							{c.label}
						</text>
					) : null}
				</g>
			))}
			{hasPrevious ? <polyline class="stat-prev" points={line} fill="none" /> : null}
		</svg>
	);
}

export interface Bar {
	label: string;
	value: number;
	/** Said at the end of the bar (the count, or hours). */
	text: string;
	href?: string;
	/** Spoken for the link. */
	linkLabel?: string;
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Horizontal bars, longest first, each one optionally a link (the therapist's own statistics). */
export function Bars({
	id,
	bars,
	title,
}: {
	id: string;
	bars: ReadonlyArray<Bar>;
	title: string;
}): JSX.Element {
	const max = Math.max(1, ...bars.map((b) => b.value));
	const ROW = 30;
	const LABEL = 128;
	const TEXT = 56;

	return (
		<svg
			class="stat-svg stat-svg--bars"
			viewBox={`0 0 ${BARS_W} ${bars.length * ROW + 6}`}
			role={bars.some((b) => b.href !== undefined) ? "group" : "img"}
			aria-labelledby={id}
		>
			<title id={id}>{title}</title>
			{bars.map((b, i) => {
				const width = ((BARS_W - LABEL - TEXT) * b.value) / max;
				const label = (
					<text class="stat-label" x="0" y={i * ROW + 19}>
						{clip(b.label, 19)}
					</text>
				);
				return (
					<g key={b.label}>
						{b.href === undefined ? (
							label
						) : (
							<a href={b.href} aria-label={b.linkLabel ?? b.label} class="stat-link">
								{label}
							</a>
						)}
						<rect
							class="stat-bar"
							x={LABEL}
							y={i * ROW + 6}
							width={Math.max(2, width)}
							height="16"
							rx="3"
						/>
						<text class="stat-value" x={LABEL + Math.max(2, width) + 8} y={i * ROW + 19}>
							{b.text}
						</text>
					</g>
				);
			})}
		</svg>
	);
}

export const HEAT_FROM = 7;
export const HEAT_TO = 20;

/** The week by the hour: a cell per weekday and starting hour, shaded by how many appointments begin then. */
export function Heat({
	heat,
	days,
	title,
	cell,
}: {
	heat: ReadonlyArray<ReadonlyArray<number>>;
	days: ReadonlyArray<string>;
	title: string;
	/** What one cell says to assistive technology. */
	cell: (day: string, hour: number, n: number) => string;
}): JSX.Element {
	const hours = Array.from({ length: HEAT_TO - HEAT_FROM + 1 }, (_, i) => HEAT_FROM + i);
	const max = Math.max(1, ...heat.flatMap((r) => hours.map((h) => r[h] ?? 0)));
	const LABEL = 40;
	const size = (HEAT_W - LABEL) / hours.length;
	const ROW = 26;
	return (
		<svg
			class="stat-svg stat-svg--heat"
			viewBox={`0 0 ${HEAT_W} ${days.length * ROW + 22}`}
			role="img"
			aria-labelledby="stat-heat-t"
		>
			<title id="stat-heat-t">{title}</title>
			{hours.map((h, i) => (
				<text key={h} class="stat-axis" x={LABEL + size * (i + 0.5)} y="12" text-anchor="middle">
					{h}
				</text>
			))}
			{days.map((d, r) => (
				<g key={d}>
					<text class="stat-label" x="0" y={22 + r * ROW + 17}>
						{d}
					</text>
					{hours.map((h, i) => {
						const n = heat[r]?.[h] ?? 0;
						return (
							<g key={h}>
								<title>{cell(d, h, n)}</title>
								<rect
									class="stat-cell"
									x={LABEL + size * i + 1}
									y={22 + r * ROW + 1}
									width={size - 2}
									height={ROW - 2}
									rx="3"
									fill-opacity={n === 0 ? 0.06 : 0.14 + 0.56 * (n / max)}
								/>
								{n === 0 ? null : (
									<text
										class="stat-cellnum"
										x={LABEL + size * (i + 0.5)}
										y={22 + r * ROW + 17}
										text-anchor="middle"
									>
										{n}
									</text>
								)}
							</g>
						);
					})}
				</g>
			))}
		</svg>
	);
}
