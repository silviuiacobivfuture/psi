import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { Method } from "../sections/method";
import { Path } from "../sections/path";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Pending } from "./shell";

/**
 * /metoda: the mechanism without jargon. The two documented steps and the figure come from the
 * home's Method section; the third step and the frequency bands wait for their sources (owner Q9).
 */
export function MethodPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const rows = [
		{ n: "01", title: m.mp_listen_1_title({}, o), text: m.faq_1_a({}, o) },
		{ n: "02", title: m.mp_listen_2_title({}, o), text: m.path_step_1_text({}, o) },
		{ n: "03", title: m.mp_listen_3_title({}, o), text: m.sample_note({}, o) },
	];
	return (
		<PageShell
			{...props}
			page="method"
			title={m.mp_title({}, o)}
			description={m.mp_description({}, o)}
		>
			<PageHero
				locale={locale}
				overline={m.method_overline({}, o)}
				title={m.mp_title({}, o)}
				lead={m.mp_description({}, o)}
			/>
			<Method locale={locale} more={false} />
			<Band overline={m.mp_next_overline({}, o)} title={m.mp_next_title({}, o)} tinted>
				<Pending locale={locale}>{m.mp_pending_entrainment({}, o)}</Pending>
			</Band>
			<Band overline={m.mp_listen_overline({}, o)} title={m.mp_listen_title({}, o)}>
				<ol class="eq-rows">
					{rows.map((r) => (
						<li class="eq-row eq-row--compact">
							<span class="eq-row__n">{r.n}</span>
							<h3 class="eq-row__title">{r.title}</h3>
							<p class="eq-row__text">{r.text}</p>
						</li>
					))}
				</ol>
				<p class="text-body-sm text-ink-muted">
					{m.faq_4_a({}, o)}{" "}
					<a class="underline underline-offset-4" href={href(locale, "safety")}>
						{m.nav_safety({}, o)}
					</a>
				</p>
			</Band>
			<Path locale={locale} />
			<NextSteps
				locale={locale}
				links={[
					{ label: m.nav_protocols({}, o), href: href(locale, "protocols") },
					{ label: m.nav_faq({}, o), href: href(locale, "faq") },
				]}
			/>
		</PageShell>
	);
}
