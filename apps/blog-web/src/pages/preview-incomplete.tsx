import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { routes } from "../routes";
import type { Theme } from "../theme";

/**
 * The live preview of a draft the blog cannot render yet (a locale or a required field is still
 * missing): what is missing, by field, so the editor knows what to write next.
 */
export function PreviewIncompletePage({
	locale,
	theme,
	origin,
	fields,
}: {
	locale: Locale;
	theme: Theme;
	origin: string;
	fields: string;
}): JSX.Element {
	const o = at(locale);
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={`${m.preview_incomplete_title({}, o)} — ${m.masthead_title({}, o)}`}
			description={m.preview_incomplete_title({}, o)}
			canonical={`${origin}${routes.home(locale)}`}
			feed={{ title: m.rss_title({}, o), href: `${origin}${routes.rss(locale)}` }}
			noindex
		>
			<main id="continut" class="mx-auto max-w-[680px] px-4 pb-16 pt-16 sm:px-6">
				<h1 class="bl-h1">{m.preview_incomplete_title({}, o)}</h1>
				<p class="bl-standfirst mt-6">{m.preview_incomplete_text({ fields }, o)}</p>
			</main>
		</Layout>
	);
}
