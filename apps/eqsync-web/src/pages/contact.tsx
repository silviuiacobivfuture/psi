import { GlassCard, OfferingPrices } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { prices } from "../cms";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { openingHours, phones, socialLinks } from "../site-settings";
import { ContactExtras } from "./contact-extras";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Para, Pending } from "./shell";

/**
 * /contact: the trader's documented details (docs/plans/eqsync-web.md §0). The contact form and
 * the 1:1 online session need a mail backend and the owner's answers (Q12, Q13), so they wait.
 */
export function ContactPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const details = [
		{ label: m.cp_company_label({}, o), value: m.cp_company({}, o) },
		{ label: m.cp_ids_label({}, o), value: m.cp_ids({}, o) },
		{ label: m.cp_address_label({}, o), value: m.cp_address({}, o) },
	];
	return (
		<PageShell
			{...props}
			page="contact"
			title={m.nav_contact({}, o)}
			description={m.cp_description({}, o)}
		>
			<PageHero
				locale={locale}
				overline={m.cp_overline({}, o)}
				title={m.cp_title({}, o)}
				lead={m.cp_lead({}, o)}
			/>
			<Band overline={m.cp_trader_overline({}, o)} title={m.cp_trader_title({}, o)}>
				<GlassCard solid class="p-6 md:p-8">
					<dl class="grid gap-6 sm:grid-cols-2">
						{details.map((d) => (
							<div>
								<dt class="text-data text-ink-faint">{d.label}</dt>
								<dd class="mt-2 text-body text-ink">{d.value}</dd>
							</div>
						))}
						<div>
							<dt class="text-data text-ink-faint">{m.cp_phone_label({}, o)}</dt>
							{phones(locale).map((p) => (
								<dd class="mt-2 text-body text-ink">
									<a class="pz-tap underline underline-offset-4" href={`tel:${p.tel}`}>
										{p.display}
									</a>
									{p.label === null ? null : (
										<span class="ml-2 text-body-sm text-ink-muted">{p.label[locale]}</span>
									)}
								</dd>
							))}
						</div>
						<ContactExtras locale={locale} hours={openingHours()} social={socialLinks()} />
					</dl>
				</GlassCard>
				<Pending locale={locale}>{m.cp_email_pending({}, o)}</Pending>
			</Band>
			<Band overline={m.cp_consult_overline({}, o)} title={m.cp_consult_title({}, o)} tinted>
				<Para>{m.cp_consult_text({}, o)}</Para>
				<OfferingPrices class="mt-8" items={prices(locale, ["sedinta-1-1"])} />
				<Pending locale={locale}>{m.cp_consult_pending({}, o)}</Pending>
			</Band>
			<NextSteps
				locale={locale}
				links={[
					{ label: m.nav_faq({}, o), href: href(locale, "faq") },
					{ label: m.nav_about({}, o), href: href(locale, "about") },
				]}
			/>
		</PageShell>
	);
}
