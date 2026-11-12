import { GlassCard, StatusBadge } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { prices } from "../cms";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Pending } from "./shell";

/** The categories' anchors on /protocoale, in the live catalogue's order. */
export const CATEGORY_IDS = [
	"calm",
	"sleep",
	"morning",
	"energy",
	"clarity",
	"performance",
	"emotions",
	"resources",
	"relationships",
	"complex",
] as const;

/**
 * /protocoale: the ten categories of the live catalogue (four protocols each). Protocol
 * descriptions and prices stay placeholders until the owner confirms the catalogue.
 */
export function ProtocolsPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const names = [
		m.protocol_1_title({}, o),
		m.protocol_2_title({}, o),
		m.pp_cat_3({}, o),
		m.pp_cat_4({}, o),
		m.protocol_3_title({}, o),
		m.pp_cat_6({}, o),
		m.pp_cat_7({}, o),
		m.pp_cat_8({}, o),
		m.pp_cat_9({}, o),
		m.pp_cat_10({}, o),
	];
	// A category's price, when the CMS has published one under its anchor (offering slug = id).
	const priced = new Map(prices(locale).map((p) => [p.slug, p]));
	const how = [
		{ n: "01", title: m.pp_how_1_title({}, o), text: m.pp_how_1_text({}, o) },
		{ n: "02", title: m.pp_how_2_title({}, o), text: m.pp_how_2_text({}, o) },
		{ n: "03", title: m.pp_how_3_title({}, o), text: m.pp_how_3_text({}, o) },
	];
	return (
		<PageShell
			{...props}
			page="protocols"
			title={m.pp_title({}, o)}
			description={m.pp_description({}, o)}
		>
			<PageHero
				locale={locale}
				overline={m.protocols_overline({}, o)}
				title={m.pp_title({}, o)}
				lead={m.protocols_text({}, o)}
			/>
			<section class="mx-auto max-w-6xl px-5 py-20 md:py-28">
				<p class="eq-overline">{m.pp_cat_overline({}, o)}</p>
				<h2 class="display eq-h2 mt-5 text-ink">{m.pp_cat_title({}, o)}</h2>
				<ol class="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{names.map((name, i) => (
						<li id={CATEGORY_IDS[i]} class="scroll-mt-28">
							<GlassCard solid class="flex h-full flex-col gap-4 p-6">
								<span class="text-data text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
								<h3 class="display text-headline text-ink">{name}</h3>
								<p class="text-body-sm text-ink-muted">{m.pp_cat_count({}, o)}</p>
								<StatusBadge tone="neutral" class="mt-auto">
									{priced.get(CATEGORY_IDS[i] ?? "")?.price ?? m.protocol_price_soon({}, o)}
								</StatusBadge>
								{priced.get(CATEGORY_IDS[i] ?? "")?.demoLabel ? (
									<StatusBadge tone="warning">
										{priced.get(CATEGORY_IDS[i] ?? "")?.demoLabel}
									</StatusBadge>
								) : null}
							</GlassCard>
						</li>
					))}
				</ol>
			</section>
			<Band overline={m.pp_how_overline({}, o)} title={m.pp_how_title({}, o)} tinted>
				<ol class="eq-rows">
					{how.map((r) => (
						<li class="eq-row eq-row--compact">
							<span class="eq-row__n">{r.n}</span>
							<h3 class="eq-row__title">{r.title}</h3>
							<p class="eq-row__text">{r.text}</p>
						</li>
					))}
				</ol>
				<Pending locale={locale}>{m.pp_pending({}, o)}</Pending>
			</Band>
			<NextSteps
				locale={locale}
				links={[
					{ label: m.nav_method({}, o), href: href(locale, "method") },
					{ label: m.nav_faq({}, o), href: href(locale, "faq") },
				]}
			/>
		</PageShell>
	);
}
