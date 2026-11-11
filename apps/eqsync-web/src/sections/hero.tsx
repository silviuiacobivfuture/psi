import { Button, Chip, DayIndex, SoundWaves } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { HeadphonesIcon } from "./headphones-icon";

const TOTAL = 21;
const DAY = 1;

/** Linear-style asymmetric hero: the promise on the left, the day numeral on the right, sound along the floor. */
export function Hero({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	return (
		<section class="eq-hero relative overflow-hidden">
			<div class="eq-bands" aria-hidden="true" />
			<div class="relative mx-auto grid grid-cols-1 min-h-[100svh] max-w-6xl content-center gap-14 px-5 pb-48 pt-36 lg:grid-cols-12 lg:gap-8">
				<div class="eq-in lg:col-span-7">
					<p class="eq-overline">{m.hero_overline({}, o)}</p>
					<h1 class="display eq-hero__title mt-6 text-ink">
						{m.hero_title_a({}, o)} <em>{m.hero_title_b({}, o)}</em>
					</h1>
					<p class="mt-8 max-w-[34rem] text-body text-ink-muted">{m.hero_lead({}, o)}</p>
					<div class="mt-10 flex flex-wrap items-center gap-x-4 gap-y-1">
						<Button size="lg" arrow href={`${b}/#incepe`}>
							{m.cta_free({}, o)}
						</Button>
						<Button variant="ghost" size="lg" href={href(locale, "method")}>
							{m.hero_secondary({}, o)}
						</Button>
					</div>
					<Chip class="eq-chip mt-8">
						<HeadphonesIcon />
						{m.headphones({}, o)}
					</Chip>
				</div>
				<div class="eq-in eq-in--late lg:col-span-5 lg:pl-6">
					<DayIndex
						dayWord={m.hero_day_word({}, o)}
						day={DAY}
						total={TOTAL}
						label={m.hero_day_label({ day: String(DAY), total: String(TOTAL) }, o)}
						caption={m.hero_caption({}, o)}
					/>
				</div>
			</div>
			<SoundWaves class="absolute inset-x-0 bottom-6" height={150} />
		</section>
	);
}
