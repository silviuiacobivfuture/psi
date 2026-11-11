import { HubCard, type Hue, StatusBadge } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href, type PageId } from "../routes";

/** The doors from the short home into the pages that hold the depth. */
export function Explore({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const doors: ReadonlyArray<{ id: PageId; hue: Hue; title: string; text: string }> = [
		{ id: "method", hue: 1, title: m.nav_method({}, o), text: m.hint_method({}, o) },
		{ id: "protocols", hue: 2, title: m.nav_protocols({}, o), text: m.hint_protocols({}, o) },
		{ id: "about", hue: 3, title: m.nav_about({}, o), text: m.hint_about({}, o) },
		{ id: "faq", hue: 1, title: m.nav_faq({}, o), text: m.hint_faq({}, o) },
		{ id: "safety", hue: 2, title: m.nav_safety({}, o), text: m.hint_safety({}, o) },
		{ id: "contact", hue: 3, title: m.nav_contact({}, o), text: m.hint_contact({}, o) },
	];
	return (
		<section id="mai-departe" class="mx-auto max-w-6xl scroll-mt-28 px-5 pb-24 md:pb-32">
			<p class="eq-overline">{m.group_more({}, o)}</p>
			<h2 class="display eq-h2 pz-rise mt-5 max-w-3xl text-ink">{m.xp_title({}, o)}</h2>
			<StatusBadge tone="warning" class="mt-6">
				{m.draft_badge({}, o)}
			</StatusBadge>
			<div class="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
