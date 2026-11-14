import { GlassCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base } from "../i18n";
import { m } from "../paraglide/messages.js";
import { bookingHref, href } from "../routes";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Pending } from "./shell";

/**
 * /contact: the operator and the residential venue, as the plan documents them. Postal address,
 * inbox, phones and the form (an n8n webhook, docs/plans/hemisync-web.md §5) wait for the owner.
 */
export function ContactPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const details = [
		{ label: m.ab_operator_title({}, o), value: m.cn_operator({}, o) },
		{ label: m.cn_ids_label({}, o), value: m.ab_operator_ids({}, o) },
		{ label: m.cn_venue_label({}, o), value: m.cn_venue({}, o) },
	];
	return (
		<PageShell
			{...props}
			otherHref={href(locale === "ro" ? "en" : "ro", "contact")}
			title={m.nav_contact({}, o)}
			description={m.cn_lead({}, o)}
		>
			<PageHero
				locale={locale}
				overline={m.nav_contact({}, o)}
				title={m.cn_title({}, o)}
				lead={m.cn_lead({}, o)}
			/>
			<Band overline={m.cn_details_overline({}, o)} title={m.cn_details_title({}, o)}>
				<GlassCard solid class="p-6 md:p-8">
					<dl class="grid gap-6">
						{details.map((d) => (
							<div>
								<dt class="hs-overline">{d.label}</dt>
								<dd class="mt-2 text-body-lg text-ink">{d.value}</dd>
							</div>
						))}
					</dl>
				</GlassCard>
				<Pending locale={locale}>{m.cn_pending({}, o)}</Pending>
			</Band>
			<NextSteps
				links={[
					{ label: m.bk_nav({}, o), href: bookingHref(locale), primary: true },
					{ label: m.nav_guide({}, o), href: `${base(locale)}/#ghid` },
					{ label: m.nav_faq({}, o), href: href(locale, "faq") },
				]}
			/>
		</PageShell>
	);
}
