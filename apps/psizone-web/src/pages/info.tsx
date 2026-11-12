import { OfferingPrices } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { prices, withoutPriceTodo } from "../cms";
import { FAQ } from "../content/faq";
import { VISIT_STEPS, VISIT_TODO } from "../content/visit";
import { at, base } from "../i18n";
import { m } from "../paraglide/messages.js";
import { Closing } from "../sections/closing";
import { FaqList } from "../sections/faq-list";
import { TodoBlock } from "../sections/todo";
import { PageShell, type ShellProps } from "./shell";

type Props = Omit<ShellProps, "path">;

/** `/prima-vizita`: what happens from the first call to the re-evaluation. */
export function FirstVisitPage(props: Props): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const b = base(locale);
	return (
		<PageShell
			{...props}
			path="/prima-vizita"
			eyebrow={m.visit_overline({}, o)}
			title={m.visit_title({}, o)}
			lead={m.visit_lead({}, o)}
			badge={m.draft_badge({}, o)}
		>
			<section class="mx-auto grid max-w-6xl gap-14 px-5 py-20 lg:grid-cols-[1.3fr_1fr]">
				<ol class="space-y-10">
					{VISIT_STEPS.map((s, i) => (
						<li class="pz-rise grid grid-cols-[3.5rem_1fr] gap-4">
							<span class="font-mono text-body-sm text-glow-1">
								{String(i + 1).padStart(2, "0")}
							</span>
							<div>
								<h2 class="text-title text-ink">{s.title[locale]}</h2>
								<p class="mt-2 text-body text-ink-muted">{s.text[locale]}</p>
							</div>
						</li>
					))}
				</ol>
				<div class="space-y-8 self-start">
					<OfferingPrices items={prices(locale, ["prima-vizita"])} />
					<TodoBlock
						locale={locale}
						items={withoutPriceTodo(VISIT_TODO, prices(locale, ["prima-vizita"]).length > 0)}
					/>
					<p class="text-body text-ink-muted">
						<a
							class="pz-tap font-semibold text-glow-1 hover:underline"
							href={`${b}/intrebari-frecvente`}
						>
							{`${m.nav_faq({}, o)} →`}
						</a>
					</p>
				</div>
			</section>
			<Closing locale={locale} />
		</PageShell>
	);
}

/** `/intrebari-frecvente`: short, sourced answers; what no source answers is a placeholder. */
export function FaqPage(props: Props): JSX.Element {
	const o = at(props.locale);
	return (
		<PageShell
			{...props}
			path="/intrebari-frecvente"
			title={m.faq_title({}, o)}
			lead={m.faq_lead({}, o)}
			badge={m.draft_badge({}, o)}
		>
			<section class="mx-auto max-w-4xl px-5 py-20">
				<FaqList locale={props.locale} entries={FAQ} />
			</section>
			<Closing locale={props.locale} />
		</PageShell>
	);
}
