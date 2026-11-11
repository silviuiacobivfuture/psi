import { Button, Prose } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { HUBS } from "../content/hubs";
import { RACE_ME_UP } from "../content/race-me-up";
import { at, base } from "../i18n";
import { m } from "../paraglide/messages.js";
import { Closing } from "../sections/closing";
import { ProgrammeCards } from "../sections/programme-cards";
import { TodoBlock } from "../sections/todo";
import { PageShell, type ShellProps } from "./shell";

type Props = Omit<ShellProps, "path">;

/** `/programe`: the two programmes. */
export function ProgrammesIndexPage(props: Props): JSX.Element {
	const o = at(props.locale);
	return (
		<PageShell
			{...props}
			path="/programe"
			eyebrow={m.nav_programmes({}, o)}
			title={m.programmes_title({}, o)}
			lead={m.programmes_lead({}, o)}
		>
			<section class="mx-auto max-w-6xl px-5 py-20">
				<ProgrammeCards locale={props.locale} />
			</section>
			<Closing locale={props.locale} />
		</PageShell>
	);
}

/** `/programe/race-me-up`: where it began, what it works on, what the owners still have to say. */
export function RaceMeUpPage(props: Props): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const b = base(locale);
	const sport = HUBS.find((h) => h.id === "sport");
	return (
		<PageShell
			{...props}
			path={RACE_ME_UP.path}
			back={{ label: m.nav_programmes({}, o), href: `${b}/programe` }}
			eyebrow={m.rmu_eyebrow({}, o)}
			title={RACE_ME_UP.name}
			lead={RACE_ME_UP.lead[locale]}
			badge={m.draft_badge({}, o)}
		>
			<section class="mx-auto grid max-w-6xl gap-14 px-5 py-20 lg:grid-cols-[1.2fr_1fr]">
				<div>
					<h2 class="display text-display-md text-ink">{m.rmu_origin({}, o)}</h2>
					<Prose class="mt-6">
						{RACE_ME_UP.origin.map((p) => (
							<p>{p[locale]}</p>
						))}
					</Prose>
					<div class="mt-8 flex flex-wrap gap-3">
						<Button variant="glass" arrow href={`${b}/povestea`}>
							{m.rmu_story_link({}, o)}
						</Button>
						{sport ? (
							<Button variant="glass" arrow href={`${b}${sport.path}`}>
								{sport.title(o)}
							</Button>
						) : null}
					</div>
				</div>
				<div>
					<h2 class="display text-display-md text-ink">{m.rmu_aims({}, o)}</h2>
					<ul class="mt-6 space-y-4">
						{RACE_ME_UP.aims.map((x) => (
							<li class="border-l-2 border-line-control pl-4 text-body-lg text-ink">{x[locale]}</li>
						))}
					</ul>
				</div>
			</section>
			<section class="mx-auto grid max-w-6xl gap-10 px-5 pb-24 lg:grid-cols-[1.2fr_1fr]">
				<p class="display text-display-md text-glow-1">{m.programmes_section_title({}, o)}</p>
				<TodoBlock locale={locale} items={RACE_ME_UP.todo} />
			</section>
			<Closing locale={locale} />
		</PageShell>
	);
}
