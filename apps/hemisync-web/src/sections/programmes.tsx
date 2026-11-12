import { ArchCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { programmePicture } from "../imagery";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";

/** The live site's programme URLs: /programe/<slug> in Romanian, /en/programmes/<slug> in English. */
export function programmeHref(locale: Locale, slug: string): string {
	return locale === "ro" ? `/programe/${slug}` : `${base(locale)}/programmes/${slug}`;
}

export function Programmes({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const cards = [
		{
			slug: "gateway-voyage",
			hue: 1,
			eyebrow: m.gateway_eyebrow({}, o),
			title: m.gateway_title({}, o),
			text: m.gateway_text({}, o),
		},
		{
			slug: "sync-creation",
			hue: 2,
			eyebrow: m.synccreation_eyebrow({}, o),
			title: m.synccreation_title({}, o),
			text: m.synccreation_text({}, o),
		},
		{
			slug: "lucid-dreaming",
			hue: 3,
			eyebrow: m.lucid_eyebrow({}, o),
			title: m.lucid_title({}, o),
			text: m.lucid_text({}, o),
		},
	] as const;
	return (
		<section id="programe" class="mx-auto max-w-7xl px-6 pb-24 pt-20 md:px-14 md:pb-36 md:pt-28">
			<div class="flex flex-wrap items-end justify-between gap-6">
				<div>
					<p class="hs-overline">{m.programmes_overline({}, o)}</p>
					<h2 class="display pz-rise mt-4 text-display-lg text-ink">
						{m.programmes_title_1({}, o)} <em>{m.programmes_title_2({}, o)}</em>
					</h2>
				</div>
				<a class="pz-tap text-link text-body" href={href(locale, "programmes")}>
					{m.programmes_all({}, o)}
				</a>
			</div>
			<div class="mt-16 grid gap-12 sm:grid-cols-2 md:gap-10 lg:grid-cols-3">
				{cards.map((c, i) => (
					<ArchCard
						id={`arch-${c.slug}`}
						class={i === 1 ? "pz-rise lg:mt-20" : "pz-rise"}
						hue={c.hue}
						eyebrow={c.eyebrow}
						title={c.title}
						text={c.text}
						more={m.programme_more({}, o)}
						href={programmeHref(locale, c.slug)}
						picture={programmePicture(locale, c.slug)}
					/>
				))}
			</div>
		</section>
	);
}
