import { AmbientField, AskBar, Button, GlassCard, GuideMessage } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** Clubul Delfinului, framed as a listening community; the complementary-care line is up front. */
export function Club({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section id="club" class="mx-auto max-w-7xl px-6 py-24 md:px-14 md:py-36">
			<div class="grid items-center gap-12 lg:grid-cols-[5fr_7fr]">
				<div class="hs-arch hs-arch--3 pz-rise mx-auto w-full max-w-sm" aria-hidden="true">
					<span class="hs-arch__window">
						<span class="hs-arch__sky" />
						<svg
							class="absolute inset-x-0 bottom-0 h-1/2 w-full"
							viewBox="0 0 400 200"
							preserveAspectRatio="none"
							aria-hidden="true"
						>
							<path
								d="M0 120 C 60 100 100 140 160 118 S 260 96 320 116 S 380 124 400 112 V200 H0Z"
								fill="var(--hs-ridge-3)"
								opacity="0.55"
							/>
							<path
								d="M0 150 C 80 132 120 166 200 146 S 330 130 400 148 V200 H0Z"
								fill="var(--hs-ridge-5)"
								opacity="0.85"
							/>
						</svg>
						<span class="hs-mist hs-mist--soft" />
					</span>
				</div>
				<div>
					<p class="hs-overline">{m.club_overline({}, o)}</p>
					<h2 class="display pz-rise mt-4 text-display-lg text-ink">
						{m.club_title_1({}, o)} <em>{m.club_title_2({}, o)}</em>
					</h2>
					<p class="mt-6 max-w-xl text-body-lg text-ink-muted">{m.club_text({}, o)}</p>
					<p class="mt-5 max-w-xl border-l-2 border-glow-2 pl-4 text-body text-ink">
						{m.club_note({}, o)}
					</p>
					<div class="mt-9 flex flex-wrap items-center gap-5">
						<Button
							variant="glass"
							arrow
							href={locale === "ro" ? "/club" : "/en/dolphin-energy-club"}
						>
							{m.club_cta({}, o)}
						</Button>
						<a class="pz-tap text-link text-body" href="#ex-dec">
							{m.club_listen({}, o)}
						</a>
					</div>
				</div>
			</div>
		</section>
	);
}

/** The AI guide's surface: one large bar, real questions as chips, the answer patched in below. */
export function Guide({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section id="ghid" class="px-4 pb-24 md:pb-36">
			<AmbientField class="mx-auto max-w-7xl rounded-[36px]">
				<div class="mx-auto max-w-3xl px-6 py-20 text-center md:py-28">
					<p class="hs-overline">{m.guide_overline({}, o)}</p>
					<h2 class="display pz-rise mt-4 text-display-lg text-ink">
						{m.guide_title_1({}, o)} <em>{m.guide_title_2({}, o)}</em>
					</h2>
					<p class="mx-auto mt-6 max-w-xl text-body-lg text-ink-muted">{m.guide_lead({}, o)}</p>
					<GlassCard class="pz-edge mt-12 p-4 text-left md:p-6">
						<AskBar
							action={`${base(locale)}/ghid`}
							target="guide-answer"
							label={m.ask_label({}, o)}
							placeholder={m.ask_placeholder({}, o)}
							sendLabel={m.ask_send({}, o)}
							suggestions={[m.ask_suggest_1({}, o), m.ask_suggest_2({}, o), m.ask_suggest_3({}, o)]}
						/>
						<div id="guide-answer" class="mt-6" aria-live="polite">
							<GuideMessage>{m.guide_intro({}, o)}</GuideMessage>
						</div>
					</GlassCard>
				</div>
			</AmbientField>
		</section>
	);
}
