import { AudioPlayer } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** Seconds are the encoded files' lengths (tools/audio/generate.py); the test checks them. */
export const DEMO_SOUNDS = [
	{ id: "demo-descent", src: "/assets/demo-coborare.mp3", seconds: 240 },
	{ id: "demo-breath", src: "/assets/demo-respiratie.mp3", seconds: 180 },
	{ id: "demo-sleep", src: "/assets/demo-somn.mp3", seconds: 300 },
] as const;

/**
 * Three binaural demos synthesised by the team. They are NOT Hemi-Sync® recordings and say so;
 * each player is followed by a text description of what is heard. Nothing loads until play.
 */
export function DemoSounds({ locale }: { locale: Locale }): JSX.Element {
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
		<section id="demo" class="hs-wash">
			<div class="mx-auto max-w-4xl px-6 py-20 md:px-14 md:py-28">
				<p class="hs-overline">{m.demo_overline({}, o)}</p>
				<h2 class="display pz-rise mt-4 text-display-lg text-ink">{m.demo_title({}, o)}</h2>
				<p class="mt-6 max-w-2xl text-body-lg text-ink-muted">{m.demo_lead({}, o)}</p>
				<p class="mt-4 max-w-2xl text-body text-ink-muted">{m.demo_safety({}, o)}</p>
				<ol class="mt-12 space-y-5">
					{DEMO_SOUNDS.map((d) => (
						<li class="pz-rise">
							<AudioPlayer
								id={d.id}
								class="hs-player--wide"
								title={texts[d.id].title}
								meta={texts[d.id].meta}
								describedBy={`${d.id}-heard`}
								src={d.src}
								duration={d.seconds}
								playLabel={m.exercise_play({ title: texts[d.id].title }, o)}
								pauseLabel={m.exercise_pause({ title: texts[d.id].title }, o)}
							/>
							<p id={`${d.id}-heard`} class="mt-3 px-5 text-body text-ink-muted">
								{texts[d.id].text}
							</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
