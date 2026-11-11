import { AmbientField, Button, PractitionerCard, StatusBadge } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { TEAM } from "../content/team";
import { at, base, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { Closing, Footer } from "../sections/closing";
import { Header } from "../sections/header";
import type { Theme } from "../theme";

interface PageProps {
	locale: Locale;
	theme: Theme;
	origin: string;
	path: string;
}

function Shell({
	locale,
	theme,
	origin,
	path,
	title,
	lead,
	children,
}: PageProps & { title: string; lead: string; children: Child }): JSX.Element {
	const other: Locale = locale === "ro" ? "en" : "ro";
	const otherHref = `${base(other)}${path}`;
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={`${title} — Psizone`}
			description={lead}
			alternate={{ locale: other, href: `${origin}${otherHref}` }}
		>
			<Header locale={locale} otherHref={otherHref} theme={theme} />
			<main id="continut">
				<AmbientField intensity="low" class="pz-arc -mt-20">
					<div class="mx-auto max-w-6xl px-5 pb-24 pt-44">
						<h1 class="display max-w-4xl text-display-xl text-ink">{title}</h1>
						<p class="mt-6 max-w-xl text-body-lg text-ink-muted">{lead}</p>
					</div>
				</AmbientField>
				{children}
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}

export function TeamPage(props: PageProps): JSX.Element {
	const o = at(props.locale);
	return (
		<Shell {...props} title={m.team_title({}, o)} lead={m.team_page_lead({}, o)}>
			<section class="mx-auto max-w-6xl px-5 py-20">
				<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{TEAM.map((p) => (
						<PractitionerCard class="pz-rise" name={p.name} role={p.role(o)} />
					))}
				</div>
				<p class="mt-8 text-body-sm text-ink-faint">{m.team_photos_soon({}, o)}</p>
			</section>
			<Closing locale={props.locale} />
		</Shell>
	);
}

/** A page whose text must come from the owner's specialists: said plainly, never invented. */
export function PreparingPage(props: PageProps & { title: string }): JSX.Element {
	const o = at(props.locale);
	return (
		<Shell {...props} title={props.title} lead={m.prep_text({}, o)}>
			<section class="mx-auto max-w-6xl space-y-8 px-5 pb-28">
				<StatusBadge tone="info">{m.prep_overline({}, o)}</StatusBadge>
				<div>
					<Button variant="glass" href={`${base(props.locale)}/`}>
						{m.prep_back({}, o)}
					</Button>
				</div>
			</section>
		</Shell>
	);
}
