import { Button } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { PAGES } from "../routes";
import { PageHero, type PageProps, PageShell, Pending } from "./shell";

export type LegalKind = "terms" | "privacy" | "withdrawal";

/**
 * The legal set: the texts in force live on the current eq-sync.ro at the same Romanian paths.
 * They move here only after the lawyer's review (docs/plans/eqsync-web.md §2, "Legal"); until
 * then the page says so and links to the text in force. Nothing legal is paraphrased.
 */
export function LegalPage(props: PageProps & { kind: LegalKind }): JSX.Element {
	const { locale, kind } = props;
	const o = at(locale);
	const title = {
		terms: m.footer_terms({}, o),
		privacy: m.footer_privacy({}, o),
		withdrawal: m.footer_withdrawal({}, o),
	}[kind];
	return (
		<PageShell {...props} page={kind} title={title} description={m.lp_lead({}, o)}>
			<PageHero
				locale={locale}
				overline={m.footer_legal_label({}, o)}
				title={title}
				lead={m.lp_lead({}, o)}
			/>
			<section class="mx-auto max-w-6xl space-y-8 px-5 pb-40 pt-16">
				<Pending locale={locale}>{m.lp_pending({}, o)}</Pending>
				<Button variant="glass" arrow href={`https://eq-sync.ro${PAGES[kind].ro}`}>
					{m.lp_live_cta({}, o)}
				</Button>
				<p class="text-data text-ink-faint">{m.footer_trader({}, o)}</p>
			</section>
		</PageShell>
	);
}
