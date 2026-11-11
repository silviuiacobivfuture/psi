import { AudioPlayer } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";

/** The four free exercises on the home page of hemi-sync.ro. Lengths are shown only where the site states one. */
export function ExerciseList({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const items: ReadonlyArray<{
		id: string;
		title: string;
		meta: string;
		text: string;
		seconds?: number;
	}> = [
		{
			id: "ex-intro",
			title: m.ex_intro_title({}, o),
			meta: m.ex_intro_meta({}, o),
			text: m.ex_intro_text({}, o),
		},
		{
			id: "ex-dec",
			title: m.ex_dec_title({}, o),
			meta: m.ex_dec_meta({}, o),
			text: m.ex_dec_text({}, o),
		},
		{
			id: "ex-forgiveness",
			title: m.ex_forgiveness_title({}, o),
			meta: m.ex_forgiveness_meta({}, o),
			text: m.ex_forgiveness_text({}, o),
		},
		{
			id: "ex-season",
			title: m.ex_season_title({}, o),
			meta: m.ex_season_meta({}, o),
			text: m.ex_season_text({}, o),
			seconds: 27 * 60 + 2,
		},
	];
	return (
		<ol class="space-y-5">
			{items.map((x) => (
				<li class="pz-rise">
					<AudioPlayer
						id={x.id}
						class={x.seconds === undefined ? "hs-player--wide hs-player--open" : "hs-player--wide"}
						title={x.title}
						meta={x.meta}
						src="/assets/sample.mp3"
						duration={x.seconds ?? 0}
						playLabel={m.exercise_play({ title: x.title }, o)}
						pauseLabel={m.exercise_pause({ title: x.title }, o)}
					/>
					<p class="mt-3 px-5 text-body-sm text-ink-muted">{x.text}</p>
				</li>
			))}
		</ol>
	);
}

/** The free exercises on the home: why to listen with headphones, then the list. */
export function Exercises({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section id="exercitii" class="hs-wash">
			<div class="mx-auto grid max-w-7xl grid-cols-1 gap-14 px-6 py-24 md:px-14 md:py-36 lg:grid-cols-[5fr_7fr]">
				<div class="lg:sticky lg:top-32 lg:self-start">
					<p class="hs-overline">{m.exercises_overline({}, o)}</p>
					<h2 class="display pz-rise mt-4 text-display-lg text-ink">
						{m.exercises_title_1({}, o)} <em>{m.exercises_title_2({}, o)}</em>
					</h2>
					<p class="mt-6 max-w-md text-body-lg text-ink-muted">{m.exercises_lead({}, o)}</p>
					<p class="mt-8 flex max-w-md gap-3 text-body-sm text-ink-muted">
						<svg
							class="mt-0.5 shrink-0 text-glow-1"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
							aria-hidden="true"
						>
							<path d="M4 15v-3a8 8 0 0 1 16 0v3" />
							<rect x="3" y="14" width="4" height="7" rx="1.5" />
							<rect x="17" y="14" width="4" height="7" rx="1.5" />
						</svg>
						{m.exercises_headphones({}, o)}
					</p>
					<a class="text-link mt-8 inline-block text-body" href={href(locale, "exercises")}>
						{m.exercises_all({}, o)}
					</a>
				</div>
				<ExerciseList locale={locale} />
			</div>
		</section>
	);
}
