import { Button, OfferingPrices } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { prices } from "../cms";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Para, Pending } from "./shell";

/**
 * /club: the Dolphin Energy Club as a listening community, with the complementary-care line at
 * the top. How requests run, membership and its fee wait for the approved rewrite (question 11).
 */
export function ClubPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	return (
		<PageShell
			{...props}
			otherHref={href(locale === "ro" ? "en" : "ro", "club")}
			title={m.cl_title({}, o)}
			description={m.club_text({}, o)}
		>
			<PageHero
				locale={locale}
				overline={m.club_overline({}, o)}
				title={m.cl_title({}, o)}
				lead={m.club_text({}, o)}
			>
				<p class="mt-8 max-w-xl border-l-2 border-glow-2 pl-4 text-body text-ink">
					{m.club_note({}, o)}
				</p>
			</PageHero>
			<Band overline={m.group_free({}, o)} title={m.ex_dec_title({}, o)}>
				<Para>{m.ex_dec_text({}, o)}</Para>
				<Button variant="glass" arrow href={href(locale, "exercises", "ex-dec")}>
					{m.club_listen({}, o)}
				</Button>
			</Band>
			<Band overline={m.cl_how_overline({}, o)} title={m.cl_how_title({}, o)} wash>
				<OfferingPrices class="mt-8" items={prices(locale, ["club"])} />
				<Pending locale={locale}>{m.cl_pending({}, o)}</Pending>
			</Band>
			<NextSteps
				links={[
					{ label: m.nav_contact({}, o), href: href(locale, "contact") },
					{ label: m.nav_faq({}, o), href: href(locale, "faq") },
				]}
			/>
		</PageShell>
	);
}
