import { currentPath, STAFF_LINK_PATH } from "@psi/site-control";
import { Button, Compass, type CompassGroup, ThemeToggle } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { account, accountGroups } from "../account";
import { estateGroup } from "../estate";
import { guideCopy } from "../guide-copy";
import { at, base, type Locale } from "../i18n";
import { hemisyncInvite } from "../invite";
import { m } from "../paraglide/messages.js";
import { SitePwaTools } from "../pwa/site";
import { href } from "../routes";
import { THEMES } from "../theme";
import { programmeHref } from "./programmes";

/**
 * No navbar: the brand sits quietly in the sky of the dawn frame (see Hero), and everything else
 * is the compass at the foot of the screen — go somewhere, or ask the guide.
 */
export function Header({ locale, otherHref }: { locale: Locale; otherHref: string }): JSX.Element {
	const o = at(locale);
	const copy = guideCopy(locale);
	const b = base(locale);
	const groups: ReadonlyArray<CompassGroup> = [
		{
			label: m.group_programmes({}, o),
			items: [
				{
					label: m.gateway_title({}, o),
					href: programmeHref(locale, "gateway-voyage"),
					hint: m.gateway_text({}, o),
				},
				{
					label: m.synccreation_title({}, o),
					href: programmeHref(locale, "sync-creation"),
					hint: m.synccreation_text({}, o),
				},
				{
					label: m.lucid_title({}, o),
					href: programmeHref(locale, "lucid-dreaming"),
					hint: m.lucid_text({}, o),
				},
				{
					label: m.programmes_all({}, o),
					href: href(locale, "programmes"),
					hint: m.hint_programmes({}, o),
				},
				{
					label: m.nav_sessions({}, o),
					href: href(locale, "programmes", "sesiuni"),
					hint: m.hint_sessions({}, o),
				},
				{
					label: m.nav_archive({}, o),
					href: href(locale, "archive"),
					hint: m.hint_archive({}, o),
				},
			],
		},
		{
			label: m.group_free({}, o),
			items: [
				{
					label: m.nav_exercises({}, o),
					href: href(locale, "exercises"),
					hint: m.exercises_lead({}, o),
				},
				{
					label: m.nav_club({}, o),
					href: href(locale, "club"),
					hint: m.club_hint({}, o),
				},
			],
		},
		{
			label: m.group_explore({}, o),
			items: [
				{
					label: m.nav_technology({}, o),
					href: href(locale, "technology"),
					hint: m.tech_hint({}, o),
				},
				{
					label: m.nav_focus({}, o),
					href: href(locale, "focus"),
					hint: m.focus_hint({}, o),
				},
				{
					label: m.nav_start({}, o),
					href: href(locale, "start"),
					hint: m.hint_start({}, o),
				},
				{
					label: m.nav_history({}, o),
					href: href(locale, "history"),
					hint: m.hint_history({}, o),
				},
				{
					label: m.nav_meditation({}, o),
					href: href(locale, "meditation"),
					hint: m.hint_meditation({}, o),
				},
				{
					label: m.nav_glossary({}, o),
					href: href(locale, "glossary"),
					hint: m.hint_glossary({}, o),
				},
				{
					label: m.nav_faq({}, o),
					href: href(locale, "faq"),
					hint: m.hint_faq({}, o),
				},
				{
					label: m.nav_about({}, o),
					href: href(locale, "about"),
					hint: m.hint_about({}, o),
				},
				{
					label: m.nav_contact({}, o),
					href: href(locale, "contact"),
					hint: m.hint_contact({}, o),
				},
				{ label: m.nav_guide({}, o), href: `${b}/#ghid` },
			],
		},
		...accountGroups(locale),
		estateGroup(locale),
	];
	return (
		<>
			<a
				href="#continut"
				class="sr-only focus:not-sr-only focus:absolute focus:left-8 focus:top-8 focus:z-50 focus:rounded-pill focus:bg-surface-1 focus:px-4 focus:py-2"
			>
				{m.skip_to_content({}, o)}
			</a>
			<Compass
				label={m.compass_label({}, o)}
				placeholder={m.compass_placeholder({}, o)}
				toggleLabel={m.compass_toggle({}, o)}
				askHint={m.compass_ask({}, o)}
				groups={groups}
				guideAction={`${b}/ghid?target=compass-answer`}
				answerId="compass-answer"
				invite={hemisyncInvite(locale, currentPath())}
				chat={{
					storageKey: "psi.chat.hemisync",
					suggestions: copy.chips,
					labels: {
						greeting: copy.welcome,
						disclaimer: m.guide_footer({}, o),
						newChat: m.compass_new_chat({}, o),
						close: m.compass_close({}, o),
						fullscreen: m.compass_fullscreen({}, o),
						exitFullscreen: m.compass_exit_fullscreen({}, o),
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
					<Button size="sm" href={`${b}/#programe`}>
						{m.cta_programmes({}, o)}
					</Button>
				}
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
