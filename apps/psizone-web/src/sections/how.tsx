import { Button, GlassCard, ProgressSignal } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

export function How({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const steps = [
		{ n: "01", title: m.how_step_1_title({}, o), text: m.how_step_1_text({}, o) },
		{ n: "02", title: m.how_step_2_title({}, o), text: m.how_step_2_text({}, o) },
		{ n: "03", title: m.how_step_3_title({}, o), text: m.how_step_3_text({}, o) },
	];
	return (
		<section class="border-y border-line bg-surface-1">
			<div class="mx-auto grid max-w-6xl gap-16 px-5 py-24 md:py-36 lg:grid-cols-[1fr_1.1fr] lg:items-center">
				<div>
					<p class="text-overline uppercase text-ink-muted">{m.how_overline({}, o)}</p>
					<h2 class="display pz-rise mt-4 text-display-lg text-ink">{m.how_title({}, o)}</h2>
					<ol class="mt-12 space-y-10">
						{steps.map((s) => (
							<li class="pz-rise grid grid-cols-[3.5rem_1fr] gap-4">
								<span class="font-mono text-body-sm text-glow-1">{s.n}</span>
								<div>
									<h3 class="text-title text-ink">{s.title}</h3>
									<p class="mt-2 text-body text-ink-muted">{s.text}</p>
								</div>
							</li>
						))}
					</ol>
					<div class="mt-12">
						<Button variant="glass" arrow href={`${base(locale)}/prima-vizita`}>
							{m.visit_link({}, o)}
						</Button>
					</div>
				</div>
				<GlassCard class="pz-edge pz-rise p-8">
					<ProgressSignal
						label={m.signal_label({}, o)}
						startLabel={m.signal_start({}, o)}
						endLabel={m.signal_end({}, o)}
						caption={m.signal_caption({}, o)}
					/>
				</GlassCard>
			</div>
		</section>
	);
}
