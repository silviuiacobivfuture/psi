import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { FromTheBlog } from "../sections/blog";
import { Closing, Footer } from "../sections/closing";
import { Explore } from "../sections/explore";
import { Faq } from "../sections/faq";
import { Guide } from "../sections/guide";
import { Header } from "../sections/header";
import { Hero } from "../sections/hero";
import { Method } from "../sections/method";
import { Offer } from "../sections/offer";
import { Path } from "../sections/path";
import { Problem } from "../sections/problem";
import { Protocols } from "../sections/protocols";
import { Sample } from "../sections/sample";
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
			<Header locale={locale} otherHref={otherHref} />
			<main id="continut">
				<Hero locale={locale} />
				<Problem locale={locale} />
				<Method locale={locale} />
				<Sample locale={locale} />
				<Path locale={locale} />
				<Protocols locale={locale} />
				<Offer locale={locale} />
				<Guide locale={locale} />
				<Faq locale={locale} />
				<Explore locale={locale} />
				<FromTheBlog locale={locale} />
				<Closing locale={locale} />
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
