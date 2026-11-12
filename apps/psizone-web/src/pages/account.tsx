import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { Footer } from "../sections/closing";
import { Header } from "../sections/header";
import type { Theme } from "../theme";

/**
 * A page of the account journey in Psizone's chrome (header, Compass, footer) and nothing else: no hero. The account
 * header, sections and content come from @psi/account and sit in the site's own container (the header's grid).
 */
export function AccountFrame({
	locale,
	theme,
	origin,
	path,
	title,
	children,
}: {
	locale: Locale;
	theme: Theme;
	origin: string;
	path: string;
	title: string;
	children: Child;
}): JSX.Element {
	const other: Locale = locale === "ro" ? "en" : "ro";
	const otherHref = `${base(other)}${path}`;
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={`${title.replace(/\.$/, "")} — Psizone`}
			description={m.account_lead({}, at(locale))}
			alternate={{ locale: other, href: `${origin}${otherHref}` }}
		>
			<Header locale={locale} otherHref={otherHref} theme={theme} />
			<main id="continut" class="mx-auto max-w-6xl px-5 pb-32 pt-28 md:pt-32">
				{children}
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
