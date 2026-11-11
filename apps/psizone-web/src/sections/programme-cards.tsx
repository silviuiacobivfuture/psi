import { HubCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { HUBS } from "../content/hubs";
import { RACE_ME_UP } from "../content/race-me-up";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** The two programmes as cards: the sport psychology hub and Race Me Up (home and `/programe`). */
export function ProgrammeCards({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	const sport = HUBS.find((h) => h.id === "sport");
	return (
		<div class="grid gap-5 sm:grid-cols-2">
			{sport ? (
				<HubCard
					class="pz-rise"
					hue={2}
					eyebrow={sport.eyebrow(o)}
					title={sport.title(o)}
					text={sport.text(o)}
					href={`${b}${sport.path}`}
				/>
			) : null}
			<HubCard
				class="pz-rise"
				hue={3}
				eyebrow={m.rmu_eyebrow({}, o)}
				title={RACE_ME_UP.name}
				text={RACE_ME_UP.lead[locale]}
				href={`${b}${RACE_ME_UP.path}`}
			/>
		</div>
	);
}
