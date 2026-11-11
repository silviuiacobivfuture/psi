import { Button } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { routes } from "../routes";
import { Footer } from "../sections/footer";
import { Header } from "../sections/header";
import type { Theme } from "../theme";

export function NotFoundPage({
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
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={`${m.notfound_title({}, o)} — ${m.masthead_title({}, o)}`}
			description={m.notfound_text({}, o)}
			canonical={`${origin}${routes.home(locale)}`}
			feed={{ title: m.rss_title({}, o), href: `${origin}${routes.rss(locale)}` }}
			noindex
		>
			<Header locale={locale} otherHref={routes.home(other)} />
			<main id="continut" class="mx-auto max-w-[1200px] px-4 sm:px-6">
				<div class="max-w-[680px] pb-16 pt-20 md:pt-32">
					<p class="bl-dateline">
						<span>{m.notfound_code({}, o)}</span>
					</p>
					<h1 class="bl-hero-title mt-12">{m.notfound_title({}, o)}</h1>
					<p class="bl-standfirst mt-8">{m.notfound_text({}, o)}</p>
					<div class="mt-10">
						<Button arrow href={routes.home(locale)}>
							{m.notfound_back({}, o)}
						</Button>
					</div>
				</div>
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
