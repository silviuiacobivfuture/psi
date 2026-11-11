import { ProgramTracker } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

const TOTAL = 21;

/** The free programme as a ruled index beside the 21 days. Celebrates showing up; nothing is ever "missed". */
export function Path({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const steps = [
		{ n: "01", title: m.path_step_1_title({}, o), text: m.path_step_1_text({}, o) },
		{ n: "02", title: m.path_step_2_title({}, o), text: m.path_step_2_text({}, o) },
		{ n: "03", title: m.path_step_3_title({}, o), text: m.path_step_3_text({}, o) },
	];
	const states = {
		done: m.tracker_day_done,
		today: m.tracker_day_today,
		next: m.tracker_day_next,
	} as const;
	return (
		<section id="program" class="mx-auto max-w-6xl scroll-mt-28 px-5 py-24 md:py-28">
			<div class="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:items-start">
				<div class="lg:col-span-6">
					<p class="eq-overline">{m.path_overline({}, o)}</p>
					<h2 class="display eq-h2 pz-rise mt-5 text-ink">{m.path_title({}, o)}</h2>
					<ol class="eq-rows mt-12">
						{steps.map((s) => (
							<li class="eq-row eq-row--compact pz-rise">
								<span class="eq-row__n">{s.n}</span>
								<h3 class="eq-row__title">{s.title}</h3>
								<p class="eq-row__text">{s.text}</p>
							</li>
						))}
					</ol>
				</div>
				<div class="pz-rise lg:sticky lg:top-28 lg:col-span-5 lg:col-start-8">
					<ProgramTracker
						class="eq-tracker"
						title={m.tracker_title({}, o)}
						subtitle={m.tracker_sub({ day: "1", total: String(TOTAL) }, o)}
						total={TOTAL}
						done={0}
						dayLabel={(d, state) => states[state]({ day: String(d) }, o)}
						note={m.tracker_note({}, o)}
					/>
				</div>
			</div>
		</section>
	);
}
