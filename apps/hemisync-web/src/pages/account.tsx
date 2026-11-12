import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { accountPath } from "../account";
import { at, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { Footer } from "../sections/closing";
import { Header } from "../sections/header";
import type { Theme } from "../theme";
import { PageHero } from "./shell";

/** A page of the account journey in this site's own shell and theme: /cont and everything under it. */
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
			<main id="continut">
				<PageHero
					locale={locale}
					overline={m.account_group({}, o)}
					title={title}
					lead={m.account_lead({}, o)}
					draft={false}
				/>
				<section class="mx-auto max-w-6xl px-5 py-20">{children}</section>
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
