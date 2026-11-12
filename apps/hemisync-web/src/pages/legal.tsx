import { Button } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href, PAGES } from "../routes";
import { PageHero, type PageProps, PageShell, Pending } from "./shell";

export type LegalKind = "terms" | "privacy" | "cookies" | "trademarks";

/** The live site, where the legal texts in force are published at the same Romanian paths. */
const LIVE = "https://www.hemi-sync.ro";

/**
 * The legal set. The texts in force stay on the live hemi-sync.ro until a lawyer reviews the
 * entity question (docs/plans/hemisync-web.md §4, question 1); nothing legal is paraphrased here.
 * The trademarks page is new and carries only the notice the footer already prints.
 */
export function LegalPage(props: PageProps & { kind: LegalKind }): JSX.Element {
	const { locale, kind } = props;
	const o = at(locale);
	const title = {
		terms: m.footer_terms({}, o),
		privacy: m.footer_privacy({}, o),
		cookies: m.footer_cookies({}, o),
		trademarks: m.lg_trademarks_title({}, o),
	}[kind];
	const isTrademarks = kind === "trademarks";
	return (
		<PageShell
			{...props}
			otherHref={href(locale === "ro" ? "en" : "ro", kind)}
			title={title}
			description={isTrademarks ? m.footer_trademarks({}, o) : m.lg_lead({}, o)}
		>
			<PageHero
				locale={locale}
				overline={m.footer_legal({}, o)}
				title={title}
				lead={isTrademarks ? m.footer_trademarks({}, o) : m.lg_lead({}, o)}
			/>
			<section class="mx-auto max-w-7xl space-y-8 px-6 pb-40 pt-16 md:px-14">
				<Pending locale={locale}>
					{isTrademarks ? m.lg_trademarks_pending({}, o) : m.lg_pending({}, o)}
				</Pending>
				{isTrademarks ? null : (
					<div class="flex flex-wrap items-center gap-6">
						<Button variant="glass" arrow href={`${LIVE}${PAGES[kind].ro}`}>
							{m.lg_live_cta({}, o)}
						</Button>
						<a class="pz-tap text-link text-body" href={href(locale, "trademarks")}>
							{m.lg_trademarks_title({}, o)}
						</a>
					</div>
				)}
				<p class="text-body-sm text-ink-faint">{m.cn_operator({}, o)}</p>
			</section>
		</PageShell>
	);
}
