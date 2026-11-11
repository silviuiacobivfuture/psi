import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { Closing, Footer } from "../sections/closing";
import { Club, Guide } from "../sections/club-guide";
import { Exercises } from "../sections/exercises";
import { Focus } from "../sections/focus";
import { Header } from "../sections/header";
import { Hero } from "../sections/hero";
import { Programmes } from "../sections/programmes";
import { Technology } from "../sections/technology";
import type { Theme } from "../theme";

/** The one-page MVP: dawn hero, programmes, free exercises before anything sold, the method, Focus, club, guide. */
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
			<Header locale={locale} otherHref={otherHref} />
			<main id="continut">
				<Hero locale={locale} />
				<Programmes locale={locale} />
				<Exercises locale={locale} />
				<Technology locale={locale} />
				<Focus locale={locale} />
				<Club locale={locale} />
				<Guide locale={locale} />
				<Closing locale={locale} />
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
