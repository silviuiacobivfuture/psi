import { Button, PractitionerCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { TEAM } from "../content/team";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

export function Methods({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const methods = [
		m.method_qeeg({}, o),
		m.method_neurofeedback({}, o),
		m.method_tms({}, o),
		m.method_aba({}, o),
		m.method_speech({}, o),
		m.method_psychotherapy({}, o),
	];
	return (
		<section id="metode" class="mx-auto max-w-6xl px-5 py-24 md:py-36">
			<p class="text-overline uppercase text-ink-muted">{m.methods_overline({}, o)}</p>
			<h2 class="display pz-rise mt-4 max-w-3xl text-display-lg text-ink">
				{m.methods_title({}, o)}
			</h2>
			<ul class="mt-12 flex flex-wrap gap-3">
				{methods.map((x) => (
					<li class="pz-rise rounded-pill border border-line-control px-6 py-3 text-title text-ink">
						{x}
					</li>
				))}
			</ul>
		</section>
	);
}

export function Team({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section id="echipa" class="mx-auto max-w-6xl px-5 pb-24 md:pb-36">
			<div class="flex flex-wrap items-end justify-between gap-6">
				<div>
					<p class="text-overline uppercase text-ink-muted">{m.team_overline({}, o)}</p>
					<h2 class="display pz-rise mt-4 text-display-lg text-ink">{m.team_title({}, o)}</h2>
				</div>
				<Button variant="glass" arrow href={`${base(locale)}/echipa`}>
					{m.team_cta({}, o)}
				</Button>
			</div>
			<div class="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
				{TEAM.slice(0, 4).map((p) => (
					<PractitionerCard class="pz-rise" name={p.name} role={p.role(o)} />
				))}
			</div>
		</section>
	);
}
