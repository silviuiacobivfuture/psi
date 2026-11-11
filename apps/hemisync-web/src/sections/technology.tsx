import { Chip, GlassCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";

/** A sine across the 600-unit diagram: `cycles` periods, `amp` units tall. */
function wave(cycles: number, amp: number): string {
	let d = "M0 30";
	for (let x = 0; x <= 600; x += 3) {
		d += ` L${x} ${(30 - amp * Math.sin((x / 600) * cycles * 2 * Math.PI)).toFixed(2)}`;
	}
	return d;
}

const LEFT = wave(25, 14);
const RIGHT = wave(26, 14);
const BEAT = wave(1, 22);

function Row({ label, d, kind }: { label: string; d: string; kind: "l" | "r" | "s" }): JSX.Element {
	return (
		<div class="grid gap-2">
			<span class={kind === "s" ? "text-data text-glow-1" : "text-data text-ink-muted"}>
				{label}
			</span>
			<svg
				class="hs-beat h-12 w-full"
				viewBox="0 0 600 60"
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				<path class={kind} d={d} />
			</svg>
		</div>
	);
}

/** Hemispheric synchronisation in one picture: 100 Hz left, 104 Hz right, a 4 Hz beat perceived. */
export function Technology({
	locale,
	more = true,
}: {
	locale: Locale;
	/** The link to /tehnologia; off on that page itself. */
	more?: boolean;
}): JSX.Element {
	const o = at(locale);
	return (
		<section id="tehnologia" class="mx-auto max-w-7xl px-6 py-24 md:px-14 md:py-36">
			<div class="grid grid-cols-1 gap-14 lg:grid-cols-[6fr_5fr] lg:items-center">
				<div>
					<p class="hs-overline">{m.tech_overline({}, o)}</p>
					<h2 class="display pz-rise mt-4 text-display-lg text-ink">
						{m.tech_title_1({}, o)} <em>{m.tech_title_2({}, o)}</em>
					</h2>
					<p class="mt-6 max-w-xl text-body-lg text-ink-muted">{m.tech_text({}, o)}</p>
					<div class="mt-8 flex flex-wrap gap-2">
						<Chip tone="ai">{m.tech_chip_1({}, o)}</Chip>
						<Chip tone="ai">{m.tech_chip_2({}, o)}</Chip>
						<Chip tone="ai">{m.tech_chip_3({}, o)}</Chip>
					</div>
					{more ? (
						<a class="text-link mt-8 inline-block text-body" href={href(locale, "technology")}>
							{m.tech_more({}, o)}
						</a>
					) : null}
				</div>
				<figure class="pz-rise m-0" aria-label={m.tech_diagram_label({}, o)}>
					<GlassCard solid class="space-y-6 p-7 md:p-9">
						<Row label={m.tech_left({}, o)} d={LEFT} kind="l" />
						<Row label={m.tech_right({}, o)} d={RIGHT} kind="r" />
						<div class="border-t border-line pt-6">
							<Row label={m.tech_sync({}, o)} d={BEAT} kind="s" />
						</div>
					</GlassCard>
					<figcaption class="mt-4 px-2 text-body-sm text-ink-muted">
						{m.tech_headphones({}, o)}
					</figcaption>
				</figure>
			</div>
			<blockquote class="pz-rise mx-auto mt-28 max-w-3xl text-center">
				<p class="hs-overline">{m.method_title({}, o)}</p>
				<p class="display mt-6 text-quote text-ink md:text-display-md">
					{m.method_text_1({}, o)} <em>{m.method_text_em({}, o)}</em> {m.method_text_2({}, o)}
				</p>
			</blockquote>
		</section>
	);
}
