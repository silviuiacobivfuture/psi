import { AudioPlayer, Chip } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { HeadphonesIcon } from "./headphones-icon";

/** The public sample, on a solid band (never on the ambient field). Nothing loads until play. */
export function Sample({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section id="asculta" class="eq-band border-y border-line bg-surface-1">
			<div class="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-12 lg:items-center">
				<div class="lg:col-span-5">
					<p class="eq-overline">{m.sample_overline({}, o)}</p>
					<h2 class="display eq-h2 pz-rise mt-5 text-ink">{m.sample_title({}, o)}</h2>
					<p class="pz-rise mt-6 max-w-md text-body text-ink-muted">{m.sample_text({}, o)}</p>
				</div>
				<div class="pz-rise lg:col-span-6 lg:col-start-7">
					<AudioPlayer
						id="sample"
						class="eq-player"
						title={m.sample_player_title({}, o)}
						meta={m.sample_player_meta({}, o)}
						src="/assets/sample.mp3"
						duration={120}
						playLabel={m.sample_play({}, o)}
						pauseLabel={m.sample_pause({}, o)}
					/>
					<div class="mt-5 flex flex-wrap items-center gap-4">
						<Chip class="eq-chip">
							<HeadphonesIcon />
							{m.headphones({}, o)}
						</Chip>
						<span class="text-data text-ink-faint">{m.sample_note({}, o)}</span>
					</div>
				</div>
			</div>
		</section>
	);
}
