import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** Native disclosure list: works without JS, keyboard and screen readers included. */
export function Faq({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const items = [
		{ q: m.faq_1_q({}, o), a: m.faq_1_a({}, o) },
		{ q: m.faq_2_q({}, o), a: m.faq_2_a({}, o) },
		{ q: m.faq_3_q({}, o), a: m.faq_3_a({}, o) },
		{ q: m.faq_4_q({}, o), a: m.faq_4_a({}, o) },
		{ q: m.faq_5_q({}, o), a: m.faq_5_a({}, o) },
	];
	return (
		<section id="intrebari" class="mx-auto max-w-6xl scroll-mt-28 px-5 pb-24 md:pb-36">
			<div class="grid grid-cols-1 gap-10 lg:grid-cols-12">
				<div class="lg:col-span-4">
					<p class="eq-overline">{m.faq_overline({}, o)}</p>
					<h2 class="display eq-h2 pz-rise mt-5 text-ink">{m.faq_title({}, o)}</h2>
				</div>
				<div class="eq-faq lg:col-span-8">
					{items.map((it, i) => (
						<details class="eq-faq__item" open={i === 0}>
							<summary>
								<span class="eq-faq__n">{String(i + 1).padStart(2, "0")}</span>
								<span class="eq-faq__q">{it.q}</span>
								<span class="eq-faq__sign" aria-hidden="true" />
							</summary>
							<p class="eq-faq__a">{it.a}</p>
						</details>
					))}
				</div>
			</div>
		</section>
	);
}
