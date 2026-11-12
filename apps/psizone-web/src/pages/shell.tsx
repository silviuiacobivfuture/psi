import { AmbientField, type JsonLdNode, StatusBadge } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { base, type Locale } from "../i18n";
import { Layout } from "../layout";
import { Footer } from "../sections/closing";
import { Header } from "../sections/header";
import type { Theme } from "../theme";

export interface ShellProps {
	locale: Locale;
	theme: Theme;
	origin: string;
	/** The page's path without the locale prefix (Romanian slug, both locales). */
	path: string;
}

/**
 * A content page: header and compass, a quiet hero (optional back link, eyebrow and review badge),
 * the page's sections, the footer.
 */
export function PageShell({
	locale,
	theme,
	origin,
	path,
	title,
	lead,
	eyebrow,
	back,
	badge,
	seoTitle,
	description,
	jsonLd,
	children,
}: ShellProps & {
	title: string;
	lead: string;
	eyebrow?: string;
	back?: { label: string; href: string };
	badge?: string;
	/** `<title>` text when it should differ from the h1 (the brand suffix is added). */
	seoTitle?: string;
	/** Meta description when it should differ from the lead. */
	description?: string;
	jsonLd?: ReadonlyArray<JsonLdNode>;
	children: Child;
}): JSX.Element {
	const other: Locale = locale === "ro" ? "en" : "ro";
	const otherHref = `${base(other)}${path}`;
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={`${(seoTitle ?? title).replace(/\.$/, "")} — Psizone`}
			description={description ?? lead}
			alternate={{ locale: other, href: `${origin}${otherHref}` }}
			{...(jsonLd === undefined ? {} : { jsonLd })}
		>
			<Header locale={locale} otherHref={otherHref} theme={theme} />
			<main id="continut">
				<AmbientField intensity="low" class="pz-arc -mt-20">
					<div class="mx-auto max-w-6xl px-5 pb-20 pt-44">
						{back ? (
							<a class="pz-tap text-body-sm text-ink-muted hover:text-ink" href={back.href}>
								{`← ${back.label}`}
							</a>
						) : null}
						{eyebrow ? (
							<p class="mt-10 text-overline uppercase tracking-[0.14em] text-ink-muted">
								{eyebrow}
							</p>
						) : null}
						<h1 class="display mt-4 max-w-4xl text-display-xl text-ink">{title}</h1>
						<p class="mt-6 max-w-2xl text-body-lg text-ink-muted">{lead}</p>
						{badge ? (
							<div class="mt-6">
								<StatusBadge tone="info">{badge}</StatusBadge>
							</div>
						) : null}
					</div>
				</AmbientField>
				{children}
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
