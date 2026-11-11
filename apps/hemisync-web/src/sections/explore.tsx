import { HubCard, type Hue, StatusBadge } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href, type PageId } from "../routes";

/** The doors from the home into the pages that hold the depth. */
export function Explore({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const doors: ReadonlyArray<{ id: PageId; hue: Hue; title: string; text: string }> = [
		{ id: "programmes", hue: 1, title: m.nav_programmes({}, o), text: m.hint_programmes({}, o) },
		{ id: "technology", hue: 2, title: m.nav_technology({}, o), text: m.tech_hint({}, o) },
		{ id: "focus", hue: 3, title: m.nav_focus({}, o), text: m.focus_hint({}, o) },
		{ id: "club", hue: 1, title: m.nav_club({}, o), text: m.club_hint({}, o) },
		{ id: "faq", hue: 2, title: m.nav_faq({}, o), text: m.hint_faq({}, o) },
		{ id: "about", hue: 3, title: m.nav_about({}, o), text: m.hint_about({}, o) },
	];
	return (
		<section id="exploreaza" class="mx-auto max-w-7xl px-6 pb-24 md:px-14 md:pb-36">
			<p class="hs-overline">{m.group_explore({}, o)}</p>
			<h2 class="display pz-rise mt-4 max-w-3xl text-display-lg text-ink">
				{m.xp_title_1({}, o)} <em>{m.xp_title_2({}, o)}</em>
			</h2>
			<StatusBadge tone="warning" class="mt-6">
				{m.draft_badge({}, o)}
			</StatusBadge>
			<div class="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{doors.map((d) => (
					<HubCard
						class="pz-rise"
						hue={d.hue}
						title={d.title}
						text={d.text}
						href={href(locale, d.id)}
					/>
				))}
			</div>
		</section>
	);
}
