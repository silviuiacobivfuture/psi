import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { NextSteps, PageHero, type PageProps, PageShell, Pending } from "./shell";

interface Group {
	id: string;
	title: string;
	items: ReadonlyArray<{ q: string; a: string }>;
}

/** One group of native disclosures, numbered on from the previous group. */
function FaqGroup({ group, start }: { group: Group; start: number }): JSX.Element {
	return (
		<section id={group.id} class="grid scroll-mt-28 grid-cols-1 gap-8 lg:grid-cols-12">
			<h2 class="display eq-h2 text-ink lg:col-span-4">{group.title}</h2>
			<div class="eq-faq lg:col-span-8">
				{group.items.map((it, i) => (
					<details class="eq-faq__item">
						<summary>
							<span class="eq-faq__n">{String(start + i + 1).padStart(2, "0")}</span>
							<span class="eq-faq__q">{it.q}</span>
							<span class="eq-faq__sign" aria-hidden="true" />
						</summary>
						<p class="eq-faq__a">{it.a}</p>
					</details>
				))}
			</div>
		</section>
	);
}

/** /intrebari: the home's five answers plus the documented ones on protocols, age and withdrawal. */
export function FaqPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const groups: ReadonlyArray<Group> = [
		{
			id: "program",
			title: m.fp_group_programme({}, o),
			items: [
				{ q: m.fq_start_q({}, o), a: m.fq_start_a({}, o) },
				{ q: m.faq_1_q({}, o), a: m.faq_1_a({}, o) },
				{ q: m.faq_2_q({}, o), a: m.faq_2_a({}, o) },
				{ q: m.faq_3_q({}, o), a: m.faq_3_a({}, o) },
			],
		},
		{
			id: "protocoale",
			title: m.fp_group_protocols({}, o),
			items: [
				{ q: m.fq_protocol_q({}, o), a: m.fq_protocol_a({}, o) },
				{ q: m.fq_swap_q({}, o), a: m.fq_swap_a({}, o) },
				{ q: m.fq_unhappy_q({}, o), a: m.fq_unhappy_a({}, o) },
			],
		},
		{
			id: "siguranta",
			title: m.fp_group_safety({}, o),
			items: [
				{ q: m.faq_4_q({}, o), a: m.faq_4_a({}, o) },
				{ q: m.faq_5_q({}, o), a: m.faq_5_a({}, o) },
				{ q: m.fq_age_q({}, o), a: m.fq_age_a({}, o) },
			],
		},
	];
	const starts = groups.map((_, i) =>
		groups.slice(0, i).reduce((sum, g) => sum + g.items.length, 0),
	);
	return (
		<PageShell {...props} page="faq" title={m.nav_faq({}, o)} description={m.fp_description({}, o)}>
			<PageHero
				locale={locale}
				overline={m.faq_overline({}, o)}
				title={m.faq_title({}, o)}
				lead={m.fp_lead({}, o)}
			/>
			<div class="mx-auto max-w-6xl space-y-20 px-5 py-20 md:py-28">
				{groups.map((g, i) => (
					<FaqGroup group={g} start={starts[i] ?? 0} />
				))}
				<Pending locale={locale}>
					{m.fp_pending({}, o)}{" "}
					<a class="underline underline-offset-4" href={href(locale, "safety")}>
						{m.nav_safety({}, o)}
					</a>
				</Pending>
			</div>
			<NextSteps
				locale={locale}
				links={[
					{ label: m.nav_contact({}, o), href: href(locale, "contact") },
					{ label: m.nav_guide({}, o), href: `${base(locale)}/#ghid` },
				]}
			/>
		</PageShell>
	);
}
