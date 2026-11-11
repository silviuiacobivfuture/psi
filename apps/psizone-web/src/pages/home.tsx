import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { FromTheBlog } from "../sections/blog";
import { Closing, Footer } from "../sections/closing";
import { Header } from "../sections/header";
import { GuideSection, Hero } from "../sections/hero";
import { FaqTeaser, Programmes, Trust } from "../sections/home-extras";
import { How } from "../sections/how";
import { Hubs } from "../sections/hubs";
import { Methods, Team } from "../sections/methods-team";
import type { Theme } from "../theme";

export function HomePage({
	locale,
	theme,
	origin,
}: {
	locale: Locale;
	theme: Theme;
	origin: string;
}): JSX.Element {
	const o = at(locale);
	const other: Locale = locale === "ro" ? "en" : "ro";
	const otherHref = other === "ro" ? "/" : "/en";
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={m.meta_title({}, o)}
			description={m.meta_description({}, o)}
			alternate={{ locale: other, href: `${origin}${otherHref}` }}
		>
			<Header locale={locale} otherHref={otherHref} theme={theme} />
			<main id="continut">
				<Hero locale={locale} />
				<GuideSection locale={locale} />
				<Trust locale={locale} />
				<Hubs locale={locale} />
				<How locale={locale} />
				<Methods locale={locale} />
				<Programmes locale={locale} />
				<Team locale={locale} />
				<FaqTeaser locale={locale} />
				<FromTheBlog locale={locale} />
				<Closing locale={locale} />
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
