import { Button } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { Band, PageHero, type PageProps, PageShell, Pending } from "./shell";

/** The working sign-up on the current eq-sync.ro, until accounts exist here (plan phase B). */
const LIVE_SIGNUP = "https://eq-sync.ro/inregistrare";

/**
 * /inregistrare: what the free programme gives, in the site's own words. There is no form yet:
 * accounts, email confirmation and consents arrive with phase B (docs/plans/eqsync-web.md §7).
 */
export function SignupPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const rows = [
		{ n: "01", title: m.path_step_1_title({}, o), text: m.hero_lead({}, o) },
		{ n: "02", title: m.path_step_2_title({}, o), text: m.path_step_2_text({}, o) },
		{ n: "03", title: m.path_step_3_title({}, o), text: m.path_step_3_text({}, o) },
	];
	return (
		<PageShell {...props} page="signup" title={m.su_title({}, o)} description={m.su_lead({}, o)}>
			<PageHero
				locale={locale}
				overline={m.path_overline({}, o)}
				title={m.su_title({}, o)}
				lead={m.su_lead({}, o)}
			/>
			<Band overline={m.su_get_overline({}, o)} title={m.closing_text({}, o)}>
				<ol class="eq-rows">
					{rows.map((r) => (
						<li class="eq-row eq-row--compact">
							<span class="eq-row__n">{r.n}</span>
							<h3 class="eq-row__title">{r.title}</h3>
							<p class="eq-row__text">{r.text}</p>
						</li>
					))}
				</ol>
				<Pending locale={locale}>{m.su_pending({}, o)}</Pending>
				<div class="flex flex-wrap items-center gap-4 pb-24">
					<Button arrow href={LIVE_SIGNUP}>
						{m.su_live_cta({}, o)}
					</Button>
					<Button variant="ghost" href={href(locale, "faq")}>
						{m.nav_faq({}, o)}
					</Button>
				</div>
			</Band>
		</PageShell>
	);
}
