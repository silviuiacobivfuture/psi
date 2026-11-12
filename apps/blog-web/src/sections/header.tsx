import { STAFF_LINK_PATH } from "@psi/site-control";
import { Compass, type CompassGroup, Masthead, ThemeToggle } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { account, accountGroups } from "../account";
import { type BlogBrand, BRANDS } from "../brands";
import { currentArticles, usedTopics } from "../content/articles";
import { EDITORIAL_POLICY } from "../content/editorial-policy";
import { brandName, topicLabel } from "../content/topics";
import { dateline } from "../dates";
import { estateGroup } from "../estate";
import { guideCopy } from "../guide-copy";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { SitePwaTools } from "../pwa/site";
import { routes } from "../routes";
import { THEMES } from "../theme";

function compassGroups(locale: Locale): ReadonlyArray<CompassGroup> {
	const o = at(locale);
	const home = routes.home(locale);
	return [
		{
			label: m.group_articles({}, o),
			items: [
				{ label: m.compass_all({}, o), href: `${home}#articole` },
				...BRANDS.map((b) => ({
					label: brandName(b, locale),
					href: `${home}?brand=${b}#articole`,
					hint: m.compass_brand_hint({ brand: brandName(b, locale) }, o),
				})),
			],
		},
		{
			label: m.group_topics({}, o),
			items: usedTopics()
				.filter((t) => t !== "editorial")
				.map((t) => ({
					label: topicLabel(t, locale),
					href: `${home}?topic=${t}#articole`,
					// The titles make the topic findable by what is in it ("panică" finds anxiety).
					hint: currentArticles()
						.filter((a) => a.topic === t)
						.map((a) => a.title[locale])
						.join(" · "),
				})),
		},
		{
			label: m.group_about({}, o),
			items: [
				{
					label: EDITORIAL_POLICY.title[locale],
					href: routes.article(locale, EDITORIAL_POLICY.slug),
				},
				{ label: m.footer_rss({}, o), href: routes.rss(locale) },
			],
		},
		...accountGroups(locale),
		estateGroup(locale),
	];
}

/**
 * No navbar: the masthead sits alone at the top of the paper (on an article, that article's brand
 * Logo, explicit), and everything else is the Compass at the foot of the screen.
 */
export function Header({
	locale,
	otherHref,
	brand,
}: {
	locale: Locale;
	otherHref: string;
	brand?: BlogBrand;
}): JSX.Element {
	const o = at(locale);
	const copy = guideCopy(locale);
	return (
		<>
			<a
				href="#continut"
				class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-full focus:bg-surface-1 focus:px-4 focus:py-2"
			>
				{m.skip_to_content({}, o)}
			</a>
			<Masthead
				homeHref={routes.home(locale)}
				brand={brand}
				title={m.masthead_title({}, o)}
				kicker={brand !== undefined ? m.masthead_title({}, o) : m.masthead_kicker({}, o)}
				aside={dateline(new Date(), locale)}
			/>
			<Compass
				label={m.compass_label({}, o)}
				placeholder={m.compass_placeholder({}, o)}
				toggleLabel={m.compass_toggle({}, o)}
				askHint={m.compass_ask({}, o)}
				groups={compassGroups(locale)}
				guideAction={`${routes.guide(locale)}?target=compass-answer`}
				answerId="compass-answer"
				chat={{
					storageKey: "psi.chat.blog",
					suggestions: copy.chips,
					labels: {
						greeting: copy.welcome,
						disclaimer: m.guide_footer({}, o),
						newChat: m.compass_new_chat({}, o),
						close: m.compass_close({}, o),
						guideTab: m.compass_tab_guide({}, o),
						pagesTab: m.compass_tab_pages({}, o),
						views: m.compass_views({}, o),
						newMessage: m.compass_new_message({}, o),
						placeholder: m.compass_chat_placeholder({}, o),
						suggestions: m.compass_suggestions({}, o),
						dropped: m.guide_dropped({}, o),
						retry: m.guide_retry({}, o),
						unanswered: m.guide_unanswered({}, o),
					},
				}}
				// Staff only: the page never reads the session; accounts off → no link (/admin still works).
				staffLink={account.enabled ? `${STAFF_LINK_PATH}?l=${locale}` : undefined}
				tools={
					<>
						<a
							class="pz-btn pz-btn--glass pz-btn--sm"
							href={otherHref}
							hreflang={locale === "ro" ? "en" : "ro"}
							aria-label={m.lang_switch_label({}, o)}
						>
							{m.lang_switch({}, o)}
						</a>
						<ThemeToggle themes={THEMES} label={m.theme_toggle({}, o)} />
						<SitePwaTools locale={locale} />
					</>
				}
			/>
		</>
	);
}
