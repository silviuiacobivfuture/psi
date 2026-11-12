import { faqPageJsonLd } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { FAQ_GROUPS } from "./content-spec";
import { msg, Related } from "./prose";
import { NextSteps, PageHero, type PageProps, PageShell } from "./shell";

interface Item {
	q: string;
	a: string;
}

/** The FAQ's questions by group, from the content messages (`fx_<group>_<n>_q` / `_a`). */
export function faqGroups(locale: PageProps["locale"]): ReadonlyArray<{
	id: string;
	title: string;
	items: ReadonlyArray<Item>;
}> {
	return FAQ_GROUPS.map((g) => ({
		id: g.id,
		title: msg(locale, `fx_g_${g.id}`),
		items: Array.from({ length: g.items }, (_, i) => ({
			q: msg(locale, `fx_${g.id}_${i + 1}_q`),
			a: msg(locale, `fx_${g.id}_${i + 1}_a`),
		})),
	}));
}

/** One group of native disclosures, numbered on from the previous group; each question is a heading. */
function FaqGroup({
	group,
	start,
}: {
	group: ReturnType<typeof faqGroups>[number];
	start: number;
}): JSX.Element {
	return (
		<section id={group.id} class="grid scroll-mt-28 grid-cols-1 gap-8 lg:grid-cols-12">
			<h2 class="display eq-h2 text-ink lg:col-span-4">{group.title}</h2>
			<div class="eq-faq lg:col-span-8">
				{group.items.map((it, i) => (
					<details class="eq-faq__item">
						<summary>
							<span class="eq-faq__n">{String(start + i + 1).padStart(2, "0")}</span>
							<h3 class="eq-faq__q">{it.q}</h3>
							<span class="eq-faq__sign" aria-hidden="true" />
						</summary>
						<p class="eq-faq__a">{it.a}</p>
					</details>
				))}
			</div>
		</section>
	);
}

/** /intrebari: every answer in five groups, with FAQPage structured data for the same questions. */
export function FaqPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const groups = faqGroups(locale);
	const starts = groups.map((_, i) =>
		groups.slice(0, i).reduce((sum, g) => sum + g.items.length, 0),
	);
	return (
		<PageShell
			{...props}
			page="faq"
			title={msg(locale, "fx_meta_title")}
			description={msg(locale, "fx_meta_desc")}
			jsonLd={[
				faqPageJsonLd(
					groups.flatMap((g) => g.items.map((it) => ({ question: it.q, answer: it.a }))),
				),
			]}
		>
			<PageHero
				locale={locale}
				overline={msg(locale, "fx_overline")}
				title={msg(locale, "fx_h1")}
				lead={msg(locale, "fx_lead")}
				photo="purpleSky"
			>
				<nav aria-label={m.c_faq_group_nav({}, o)} class="mt-10">
					<ul class="flex flex-wrap gap-x-6 gap-y-3 text-body-sm text-ink-muted">
						{groups.map((g) => (
							<li>
								<a class="underline underline-offset-4" href={`#${g.id}`}>
									{g.title}
								</a>
							</li>
						))}
					</ul>
				</nav>
			</PageHero>
			<div class="mx-auto max-w-6xl space-y-20 px-5 py-20 md:py-28">
				{groups.map((g, i) => (
					<FaqGroup group={g} start={starts[i] ?? 0} />
				))}
			</div>
			<Related locale={locale} pages={["method", "science", "listen", "safety"]} />
			<NextSteps locale={locale} links={[]} />
		</PageShell>
	);
}
