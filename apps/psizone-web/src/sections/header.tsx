import { currentPath, STAFF_LINK_PATH } from "@psi/site-control";
import { Button, Compass, type CompassGroup, DayNight, Logo, ThemeToggle } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { account, accountGroups } from "../account";
import { HUBS } from "../content/hubs";
import { METHODS } from "../content/methods";
import { RACE_ME_UP } from "../content/race-me-up";
import { estateGroup } from "../estate";
import { guideCopy } from "../guide-copy";
import { guideStart } from "../guide-start";
import { at, base, type Locale } from "../i18n";
import { psizoneInvite } from "../invite";
import { m } from "../paraglide/messages.js";
import { SitePwaTools } from "../pwa/site";
import { THEMES, type Theme } from "../theme";

/**
 * No navbar: the brand sits quietly in the corner, and everything else is the compass at the foot
 * of the screen — go somewhere, or ask the guide.
 */
export function Header({
	locale,
	otherHref,
	theme,
}: {
	locale: Locale;
	otherHref: string;
	theme: Theme;
}): JSX.Element {
	const o = at(locale);
	const copy = guideCopy(locale);
	const b = base(locale);
	const hub = (id: string) => HUBS.find((h) => h.id === id);
	const hubItem = (id: string) => {
		const h = hub(id);
		return h ? [{ label: h.title(o), href: `${b}${h.path}`, hint: h.text(o) }] : [];
	};
	const groups: ReadonlyArray<CompassGroup> = [
		{
			label: m.group_children({}, o),
			items: [
				...hubItem("autism"),
				...hubItem("adhd"),
				...hubItem("sensory"),
				...hubItem("speech"),
			],
		},
		{
			label: m.group_teens_adults({}, o),
			items: [
				...hubItem("teens"),
				...hubItem("adults"),
				...hubItem("couple"),
				...hubItem("stroke"),
				...hubItem("oncology"),
			],
		},
		{
			// `compass` excludes EQ-Sync: the compass shows on hub pages, which never name it.
			label: m.group_methods_programmes({}, o),
			items: [
				{ label: m.nav_all_methods({}, o), href: `${b}/metode` },
				...METHODS.filter((x) => x.compass).map((x) => ({
					label: x.name[locale],
					href: `${b}${x.path}`,
					hint: x.lead[locale],
				})),
				{ label: m.nav_programmes({}, o), href: `${b}/programe` },
				...hubItem("sport"),
				{
					label: RACE_ME_UP.name,
					href: `${b}${RACE_ME_UP.path}`,
					hint: RACE_ME_UP.lead[locale],
				},
			],
		},
		{
			label: m.group_centre({}, o),
			items: [
				{ label: m.nav_home({}, o), href: `${b}/` },
				{ label: m.nav_how({}, o), href: `${b}/#metode` },
				{ label: m.nav_visit({}, o), href: `${b}/prima-vizita` },
				{ label: m.nav_faq({}, o), href: `${b}/intrebari-frecvente` },
				{ label: m.nav_story({}, o), href: `${b}/povestea` },
				{ label: m.nav_team({}, o), href: `${b}/echipa` },
				{ label: m.cta_book({}, o), href: `${b}/contact` },
			],
		},
		...accountGroups(locale),
		estateGroup(locale),
	];
	return (
		<>
			<a href="#continut" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4">
				{m.skip_to_content({}, o)}
			</a>
			<header class="pointer-events-none absolute inset-x-0 top-0 z-40">
				<div class="border-b border-line">
					<div class="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4">
						<span class="pointer-events-auto">
							<Logo size={48} href={`${b}/`} />
						</span>
						<span class="pointer-events-auto ml-auto hidden min-[480px]:block">
							<DayNight
								day="psizone-light"
								night="psizone-dark"
								current={theme}
								label={m.theme_toggle({}, o)}
								dayLabel={m.theme_day({}, o)}
								nightLabel={m.theme_night({}, o)}
							/>
						</span>
						<span class="pointer-events-auto max-[479px]:ml-auto">
							<Button size="sm" href={`${b}/contact`}>
								{m.header_cta({}, o)}
							</Button>
						</span>
					</div>
				</div>
			</header>
			<Compass
				label={m.compass_label({}, o)}
				placeholder={m.compass_placeholder({}, o)}
				toggleLabel={m.compass_toggle({}, o)}
				askHint={m.compass_ask({}, o)}
				groups={groups}
				guideAction={`${b}/ghid?target=compass-answer`}
				answerId="compass-answer"
				startWith={guideStart(locale)}
				bookWith={m.compass_book_with({}, o)}
				invite={psizoneInvite(locale, currentPath())}
				chat={{
					storageKey: "psi.chat.psizone",
					suggestions: copy.chips,
					labels: {
						greeting: copy.welcome,
						disclaimer: m.guide_footer({}, o),
						newChat: m.compass_new_chat({}, o),
						close: m.compass_close({}, o),
						fullscreen: m.compass_fullscreen({}, o),
						fullscreenOn: m.compass_fullscreen_on({}, o),
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
				action={
					<Button size="sm" href={`${b}/contact`}>
						{m.cta_book({}, o)}
					</Button>
				}
				tools={
					<>
						<a
							class="pz-btn pz-btn--glass pz-btn--sm"
							href={otherHref}
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
