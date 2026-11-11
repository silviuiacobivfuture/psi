import { HubCard, type Hue } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

export function Hubs({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	const hubs: ReadonlyArray<{ eyebrow: string; title: string; text: string; href: string }> = [
		{
			eyebrow: m.hub_autism_eyebrow({}, o),
			title: m.hub_autism_title({}, o),
			text: m.hub_autism_text({}, o),
			href: `${b}/copii/autism`,
		},
		{
			eyebrow: m.hub_adhd_eyebrow({}, o),
			title: m.hub_adhd_title({}, o),
			text: m.hub_adhd_text({}, o),
			href: `${b}/copii/adhd`,
		},
		{
			eyebrow: m.hub_sensory_eyebrow({}, o),
			title: m.hub_sensory_title({}, o),
			text: m.hub_sensory_text({}, o),
			href: `${b}/copii/integrare-senzoriala`,
		},
		{
			eyebrow: m.hub_speech_eyebrow({}, o),
			title: m.hub_speech_title({}, o),
			text: m.hub_speech_text({}, o),
			href: `${b}/copii/logopedie`,
		},
		{
			eyebrow: m.hub_teens_eyebrow({}, o),
			title: m.hub_teens_title({}, o),
			text: m.hub_teens_text({}, o),
			href: `${b}/adolescenti`,
		},
		{
			eyebrow: m.hub_adults_eyebrow({}, o),
			title: m.hub_adults_title({}, o),
			text: m.hub_adults_text({}, o),
			href: `${b}/adulti/anxietate-depresie`,
		},
	];
	return (
		<section id="pentru-cine" class="mx-auto max-w-6xl px-5 py-24 md:py-36">
			<p class="text-overline uppercase text-ink-muted">{m.hubs_overline({}, o)}</p>
			<h2 class="display pz-rise mt-4 max-w-3xl text-display-lg text-ink">{m.hubs_title({}, o)}</h2>
			<div class="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{hubs.map((h, i) => (
					<HubCard
						class="pz-rise"
						hue={((i % 3) + 1) as Hue}
						eyebrow={h.eyebrow}
						title={h.title}
						text={h.text}
						href={h.href}
					/>
				))}
			</div>
		</section>
	);
}
