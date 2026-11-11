import { Button, ProductCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** A teaser of three protocol categories; prices stay a placeholder until the catalogue is confirmed. */
export function Protocols({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const href = `${base(locale)}/protocoale`;
	const titles = [m.protocol_1_title({}, o), m.protocol_2_title({}, o), m.protocol_3_title({}, o)];
	return (
		<section id="protocoale" class="eq-band scroll-mt-28 border-y border-line bg-surface-1">
			<div class="mx-auto max-w-6xl px-5 py-24 md:py-32">
				<div class="flex flex-wrap items-end justify-between gap-8">
					<div class="max-w-2xl">
						<p class="eq-overline">{m.protocols_overline({}, o)}</p>
						<h2 class="display eq-h2 pz-rise mt-5 text-ink">{m.protocols_title({}, o)}</h2>
						<p class="pz-rise mt-6 max-w-lg text-body text-ink-muted">{m.protocols_text({}, o)}</p>
					</div>
					<Button variant="glass" arrow href={href}>
						{m.protocols_all({}, o)}
					</Button>
				</div>
				<div class="eq-products mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
					{titles.map((title) => (
						<ProductCard
							class="pz-rise"
							kind={m.protocol_kind({}, o)}
							title={title}
							text={m.protocol_text({}, o)}
							badge={m.protocol_price_soon({}, o)}
							price={m.protocol_price({}, o)}
							action={
								<Button variant="glass" size="sm" href={href}>
									{m.protocol_action({}, o)}
								</Button>
							}
						/>
					))}
				</div>
			</div>
		</section>
	);
}
