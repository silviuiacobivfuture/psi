import { AmbientField, ImageCredits } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { IMAGE_CREDITS } from "../images.generated";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { Footer } from "../sections/closing";
import { CREDITS_PATH } from "../sections/credits-path";
import { Header } from "../sections/header";
import type { Theme } from "../theme";

/**
 * /credite-foto: every photograph on the site with its author, source and licence. Required by
 * the CC BY licence of the Danube photograph on /povestea; listed in full for all of them.
 */
export function CreditsPage({
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
	const otherHref = `${base(other)}${CREDITS_PATH}`;
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={`${m.credits_title({}, o)} — Psizone`}
			description={m.credits_lead({}, o)}
			alternate={{ locale: other, href: `${origin}${otherHref}` }}
		>
			<Header locale={locale} otherHref={otherHref} theme={theme} />
			<main id="continut">
				<AmbientField intensity="low" class="pz-arc -mt-20">
					<div class="mx-auto max-w-6xl px-5 pb-16 pt-44">
						<h1 class="display max-w-4xl text-display-xl text-ink">{m.credits_title({}, o)}</h1>
						<p class="mt-6 max-w-2xl text-body-lg text-ink-muted">{m.credits_lead({}, o)}</p>
						<p class="mt-4 max-w-2xl text-body text-ink">{m.credits_note({}, o)}</p>
					</div>
				</AmbientField>
				<section class="mx-auto max-w-6xl px-5 pb-28">
					<ImageCredits
						class="max-w-3xl"
						credits={IMAGE_CREDITS}
						labels={{
							by: m.credits_by({}, o),
							licence: m.credits_licence({}, o),
							source: m.credits_source({}, o),
						}}
					/>
				</section>
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
