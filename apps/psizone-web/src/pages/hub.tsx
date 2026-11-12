import { AmbientField, ArticleCard, AskBar, GuideMessage, StatusBadge } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Hub } from "../content/hubs";
import { at, base, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { Closing, Footer } from "../sections/closing";
import { GroupPhoto } from "../sections/group-photo";
import { Header } from "../sections/header";
import { HubMethods } from "../sections/hub-methods";
import type { Theme } from "../theme";

export function HubPage({
	hub,
	locale,
	theme,
	origin,
}: {
	hub: Hub;
	locale: Locale;
	theme: Theme;
	origin: string;
}): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	const other: Locale = locale === "ro" ? "en" : "ro";
	const otherHref = `${base(other)}${hub.path}`;
	const title = hub.title(o);
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={`${title} — Psizone`}
			description={hub.text(o)}
			alternate={{ locale: other, href: `${origin}${otherHref}` }}
		>
			<Header locale={locale} otherHref={otherHref} theme={theme} />
			<main id="continut">
				<AmbientField intensity="low" class="pz-arc -mt-20">
					<div class="mx-auto max-w-6xl px-5 pb-28 pt-44">
						<a class="pz-tap text-body-sm text-ink-muted hover:text-ink" href={`${b}/#pentru-cine`}>
							{`← ${m.hub_back({}, o)}`}
						</a>
						<p class="mt-10 text-overline uppercase tracking-[0.14em] text-ink-muted">
							{hub.eyebrow(o)}
						</p>
						<h1 class="display mt-4 max-w-4xl text-display-xl text-ink">{title}</h1>
						<p class="mt-6 max-w-xl text-body-lg text-ink-muted">{hub.text(o)}</p>
						{hub.note ? <p class="mt-4 max-w-xl text-body text-ink">{hub.note(o)}</p> : null}
						<div class="mt-6">
							<StatusBadge tone="info">{m.hub_review_badge({}, o)}</StatusBadge>
						</div>
						<div class="pz-edge mt-12 max-w-3xl rounded-xl p-4 backdrop-blur-2xl md:p-6">
							<AskBar
								action={`${b}/ghid`}
								target="guide-answer"
								label={m.ask_label({}, o)}
								placeholder={m.hub_ask_placeholder({ topic: title }, o)}
								sendLabel={m.ask_send({}, o)}
								suggestions={hub.spokes.map((s) => s(o))}
							/>
							<div id="guide-answer" class="mt-4" aria-live="polite">
								<GuideMessage>{m.guide_intro({}, o)}</GuideMessage>
							</div>
						</div>
					</div>
				</AmbientField>
				<section class="mx-auto max-w-6xl px-5 py-24">
					<div class="grid items-end gap-10 lg:grid-cols-[1fr_440px]">
						<div>
							<p class="text-overline uppercase tracking-[0.14em] text-ink-muted">
								{m.hub_coming_overline({}, o)}
							</p>
							<h2 class="display pz-rise mt-4 max-w-3xl text-display-lg text-ink">
								{m.hub_coming_title({}, o)}
							</h2>
						</div>
						<GroupPhoto group={hub.group} locale={locale} />
					</div>
					<div class="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
						{hub.spokes.map((s) => (
							<ArticleCard
								class="pz-rise"
								title={s(o)}
								topic={hub.eyebrow(o)}
								meta={m.hub_coming_meta({}, o)}
								href={`${b}${hub.path}`}
							/>
						))}
					</div>
				</section>
				<HubMethods hub={hub} locale={locale} />
				<Closing locale={locale} />
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
