import { Logo } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { accountPath } from "../account";
import { at, base, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { Footer } from "../sections/closing";
import { Header } from "../sections/header";
import type { Theme } from "../theme";

/**
 * A page of the account journey in this site's chrome (header, Compass, footer) and nothing else: no hero. The
 * account header, sections and content come from @psi/account and sit in the site's own container, so they share
 * the header's grid.
 */
export function AccountFrame({
	locale,
	theme,
	origin,
	title,
	children,
}: {
	locale: Locale;
	theme: Theme;
	origin: string;
	title: string;
	children: Child;
}): JSX.Element {
	const o = at(locale);
	const other: Locale = locale === "ro" ? "en" : "ro";
	const otherHref = accountPath(other);
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={m.page_title({ title }, o)}
			description={m.account_lead({}, o)}
			alternate={{ locale: other, href: `${origin}${otherHref}` }}
		>
			<Header locale={locale} otherHref={otherHref} />
			<div class="mx-auto max-w-7xl px-6 pt-8 md:px-14 md:pt-10">
				<Logo size={30} href={`${base(locale)}/`} />
			</div>
			<main id="continut" class="mx-auto max-w-7xl px-6 pb-32 pt-10 md:px-14 md:pt-14">
				{children}
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
