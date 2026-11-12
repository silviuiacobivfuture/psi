import { HubCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { HUBS, type HubGroup } from "../content/hubs";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { GroupPhotoTile } from "./group-photo";

/**
 * "Pentru cine": the condition hubs, in the groups the compass uses too. The programme hub has its
 * own home section (sections/home-extras.tsx).
 */
export function Hubs({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	const groups: ReadonlyArray<{ id: HubGroup; label: string }> = [
		{ id: "children", label: m.group_children({}, o) },
		{ id: "teens-adults", label: m.group_teens_adults({}, o) },
	];
	return (
		<section id="pentru-cine" class="hub-section mx-auto max-w-6xl px-5 py-24 md:py-36">
			<p class="text-overline uppercase text-ink-muted">{m.hubs_overline({}, o)}</p>
			<h2 class="display pz-rise mt-4 max-w-3xl text-display-lg text-ink">{m.hubs_title({}, o)}</h2>
			{groups.map((g) => (
				<div class="mt-14">
					<h3 class="text-overline uppercase tracking-[0.14em] text-ink-muted">{g.label}</h3>
					<div class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
						{HUBS.filter((h) => h.group === g.id).map((h) => (
							<HubCard
								class="hub-card pz-rise"
								hue={h.hue}
								eyebrow={h.eyebrow(o)}
								title={h.title(o)}
								text={h.text(o)}
								href={`${b}${h.path}`}
							/>
						))}
						<GroupPhotoTile group={g.id} locale={locale} />
					</div>
				</div>
			))}
		</section>
	);
}
