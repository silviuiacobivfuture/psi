import { AudioPlayer } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { DEMO_SOUNDS } from "./demo-sounds";

/**
 * The free listening on the home page: the team's three binaural demos (DEMO_SOUNDS), each with
 * what you will hear. The Monroe-titled exercises it used to list had no audio the site may play;
 * they come back when the licence is confirmed in writing.
 */
export function ExerciseList({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const texts = {
		"demo-descent": {
			title: m.demo_descent_title({}, o),
			meta: m.demo_descent_meta({}, o),
			text: m.demo_descent_text({}, o),
		},
		"demo-breath": {
			title: m.demo_breath_title({}, o),
			meta: m.demo_breath_meta({}, o),
			text: m.demo_breath_text({}, o),
		},
		"demo-sleep": {
			title: m.demo_sleep_title({}, o),
			meta: m.demo_sleep_meta({}, o),
			text: m.demo_sleep_text({}, o),
		},
	} as const;
	return (
		<ol class="space-y-5">
			{DEMO_SOUNDS.map((d) => (
				<li class="pz-rise">
					<AudioPlayer
						id={`home-${d.id}`}
						class="hs-player--wide"
						title={texts[d.id].title}
						meta={texts[d.id].meta}
						describedBy={`home-${d.id}-heard`}
						src={d.src}
						duration={d.seconds}
						playLabel={m.exercise_play({ title: texts[d.id].title }, o)}
						pauseLabel={m.exercise_pause({ title: texts[d.id].title }, o)}
					/>
					<p id={`home-${d.id}-heard`} class="mt-3 px-5 text-body text-ink-muted">
						{texts[d.id].text}
					</p>
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
					<p class="mt-8 flex max-w-md gap-3 text-body text-ink-muted">
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
					<a
						class="pz-tap text-link mt-8 inline-flex items-center text-body"
						href={href(locale, "exercises")}
					>
						{m.exercises_all({}, o)}
					</a>
				</div>
				<ExerciseList locale={locale} />
			</div>
		</section>
	);
}
