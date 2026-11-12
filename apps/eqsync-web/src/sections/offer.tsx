import { Button, ProductCard, StatusBadge } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";

/**
 * "21 de zile gratuite. Apoi alegi tu." (docs/plans/eqsync-web.md §2, Home): the free programme
 * beside the protocols. The protocol price stays a placeholder until the owner confirms it.
 */
export function Offer({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section id="oferta" class="mx-auto max-w-6xl scroll-mt-28 px-5 py-24 md:py-32">
			<div class="max-w-2xl">
				<p class="eq-overline">{m.of_overline({}, o)}</p>
				<h2 class="display eq-h2 pz-rise mt-5 text-ink">{m.of_title({}, o)}</h2>
				<StatusBadge tone="warning" class="mt-6">
					{m.draft_badge({}, o)}
				</StatusBadge>
			</div>
			<div class="eq-products mt-14 grid grid-cols-1 gap-5 md:grid-cols-2">
				<ProductCard
					class="pz-rise"
					kind={m.path_overline({}, o)}
					title={m.path_title({}, o)}
					text={m.hero_lead({}, o)}
					price={m.of_free_price({}, o)}
					action={
						<Button size="sm" href={href(locale, "signup")}>
							{m.cta_free({}, o)}
						</Button>
					}
				/>
				<ProductCard
					class="pz-rise"
					kind={m.protocols_overline({}, o)}
					title={m.of_paid_title({}, o)}
					text={m.protocols_text({}, o)}
					badge={m.protocol_price_soon({}, o)}
					price={m.protocol_price({}, o)}
					action={
						<Button variant="glass" size="sm" href={href(locale, "protocols")}>
							{m.protocols_all({}, o)}
						</Button>
					}
				/>
			</div>
			<p class="mt-8 text-body text-ink-faint">{m.of_note({}, o)}</p>
		</section>
	);
}
