import { ArrowIcon, Button, DawnLandscape, GlassCard, Logo } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { programmeHref } from "./programmes";

/** "Călătoria ta spre interior *începe aici.*" in the sky of a drawn dawn; mist rises from the valley. */
export function Hero({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<DawnLandscape id="hero-dawn">
			<div class="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-12 px-6 pb-8 pt-8 md:px-14 md:pb-14 md:pt-10">
				<header>
					<Logo size={30} href={`${base(locale)}/`} />
				</header>
				<div class="mt-4 max-w-5xl md:mt-8">
					<p class="hs-overline pz-rise">{m.hero_overline({}, o)}</p>
					<h1 class="display hs-hero-title mt-6 text-ink">
						<span class="block">{m.hero_title_1({}, o)}</span>
						<em class="block">{m.hero_title_2({}, o)}</em>
					</h1>
					<p class="mt-7 max-w-xl text-pretty text-body-lg text-ink">{m.hero_lead({}, o)}</p>
				</div>
				<div class="mt-auto flex justify-start md:justify-end xl:absolute xl:bottom-12 xl:right-14">
					<GlassCard class="pz-edge w-full max-w-sm p-6 md:p-7">
						<p class="hs-overline">{m.hero_card_overline({}, o)}</p>
						<p class="display mt-3 text-headline text-ink">{m.hero_card_title({}, o)}</p>
						<p class="mt-2 text-body text-ink-muted">{m.hero_card_text({}, o)}</p>
						<div class="mt-6 flex flex-wrap items-center gap-4">
							<Button arrow href={`${base(locale)}/#programe`}>
								{m.cta_programmes({}, o)}
							</Button>
							<a class="text-link text-body-sm" href={programmeHref(locale, "gateway-voyage")}>
								{m.programme_more({}, o)}
							</a>
						</div>
						<a
							class="text-link mt-5 flex items-center gap-2 border-t border-line pt-4 text-body-sm"
							href="#exercitii"
						>
							{m.hero_listen({}, o)}
							<ArrowIcon size={14} />
						</a>
					</GlassCard>
				</div>
			</div>
		</DawnLandscape>
	);
}
