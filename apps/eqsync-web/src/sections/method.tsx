import { Picture } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { methodPicture } from "../imagery";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { HeadphonesIcon } from "./headphones-icon";

const W = 600;
const LEFT = 44;
const RIGHT = 39;

/** A sampled curve as an SVG path across the strip; `y` returns an offset from the midline. */
function curve(mid: number, y: (x: number) => number): string {
	let d = "";
	for (let x = 0; x <= W; x += 2) d += `${x === 0 ? "M" : " L"}${x} ${(mid + y(x)).toFixed(2)}`;
	return d;
}

const tone = (period: number) => (x: number) => Math.sin((2 * Math.PI * x) / period);
const LEFT_WAVE = curve(20, (x) => 13 * tone(LEFT)(x));
const RIGHT_WAVE = curve(20, (x) => 13 * tone(RIGHT)(x));
const BEAT_WAVE = curve(30, (x) => 11 * (tone(LEFT)(x) + tone(RIGHT)(x)));
const ENVELOPE = (sign: 1 | -1) =>
	curve(30, (x) => sign * 22 * Math.abs(Math.cos(Math.PI * x * (1 / RIGHT - 1 / LEFT))));
const ENV_TOP = ENVELOPE(-1);
const ENV_BOTTOM = ENVELOPE(1);

function Strip({
	label,
	height,
	children,
}: {
	label: string;
	height: number;
	children: Child;
}): JSX.Element {
	return (
		<div class="eq-fig__row">
			<span class="eq-fig__label">{label}</span>
			<svg
				class="eq-fig__strip"
				viewBox={`0 0 ${W} ${height}`}
				preserveAspectRatio="none"
				style={{ height: `${height}px` }}
				aria-hidden="true"
			>
				{children}
			</svg>
		</div>
	);
}

/** Binaural beats in one plain line, then a figure: two tones in, their difference out. */
export function Method({
	locale,
	more = true,
}: {
	locale: Locale;
	/** The link to /metoda; off on that page itself. */
	more?: boolean;
}): JSX.Element {
	const o = at(locale);
	return (
		<section id="metoda" class="mx-auto max-w-6xl scroll-mt-28 px-5 pb-24 pt-8 md:pb-32 md:pt-12">
			<div class="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:items-center">
				<div class="lg:col-span-5">
					<p class="eq-overline">{m.method_overline({}, o)}</p>
					<h2 class="display eq-h2 pz-rise mt-5 text-ink">{m.method_title({}, o)}</h2>
					<p class="eq-lede pz-rise mt-8">{m.method_line({}, o)}</p>
					<ol class="mt-10 space-y-5">
						<li class="eq-step pz-rise">
							<span>01</span>
							<p>{m.method_step_1({}, o)}</p>
						</li>
						<li class="eq-step pz-rise">
							<span>02</span>
							<p>{m.method_step_2({}, o)}</p>
						</li>
					</ol>
					<figure class="pz-photo eq-photo pz-rise mt-10 aspect-[3/2]">
						<Picture {...methodPicture(locale)} />
					</figure>
					{more ? (
						<a
							class="pz-tap mt-10 inline-flex items-center text-data text-ink underline underline-offset-4"
							href={href(locale, "method")}
						>
							{m.mp_more({}, o)}
						</a>
					) : null}
				</div>
				<figure class="eq-fig pz-rise lg:col-span-6 lg:col-start-7">
					<Strip label={m.method_left({}, o)} height={40}>
						<path class="eq-fig__tone eq-fig__tone--left" d={LEFT_WAVE} />
					</Strip>
					<Strip label={m.method_right({}, o)} height={40}>
						<path class="eq-fig__tone eq-fig__tone--right" d={RIGHT_WAVE} />
					</Strip>
					<Strip label={m.method_beat({}, o)} height={60}>
						<path class="eq-fig__env" d={ENV_TOP} />
						<path class="eq-fig__env" d={ENV_BOTTOM} />
						<path class="eq-fig__tone eq-fig__tone--beat" d={BEAT_WAVE} />
					</Strip>
					<figcaption class="eq-fig__caption">
						<span>{m.method_fig({}, o)}</span>
						<span class="eq-fig__note">
							<HeadphonesIcon />
							{m.method_note({}, o)}
						</span>
					</figcaption>
				</figure>
			</div>
		</section>
	);
}
