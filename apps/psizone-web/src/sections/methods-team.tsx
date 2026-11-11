import { Button, PractitionerCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { METHODS } from "../content/methods";
import { TEAM } from "../content/team";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** The clinical methods as doors to their pages; the own methods named only on `/metode`. */
export function Methods({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	return (
		<section id="metode" class="mx-auto max-w-6xl px-5 py-24 md:py-36">
			<p class="text-overline uppercase text-ink-muted">{m.methods_overline({}, o)}</p>
			<h2 class="display pz-rise mt-4 max-w-3xl text-display-lg text-ink">
				{m.methods_title({}, o)}
			</h2>
			<ul class="mt-12 flex flex-wrap gap-3">
				{METHODS.filter((x) => !x.own).map((x) => (
					<li>
						<a
							class="pz-rise inline-block rounded-pill border border-line-control px-6 py-3 text-title text-ink hover:border-accent hover:text-glow-1"
							href={`${b}${x.path}`}
						>
							{x.name[locale]}
						</a>
					</li>
				))}
			</ul>
			<div class="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
				<p class="text-body-lg text-ink-muted">
					<a class="font-semibold text-glow-1 hover:underline" href={`${b}/metode#proprii`}>
						{m.methods_own_title({}, o)}
					</a>
					{` ${m.methods_own_text({}, o)}`}
				</p>
				<Button variant="glass" arrow href={`${b}/metode`}>
					{m.nav_all_methods({}, o)}
				</Button>
			</div>
		</section>
	);
}

export function Team({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section id="echipa" class="mx-auto max-w-6xl px-5 py-24 md:py-36">
			<div class="flex flex-wrap items-end justify-between gap-6">
				<div>
					<p class="text-overline uppercase text-ink-muted">{m.team_overline({}, o)}</p>
					<h2 class="display pz-rise mt-4 text-display-lg text-ink">{m.team_title({}, o)}</h2>
					<p class="mt-6 max-w-2xl text-body-lg text-ink-muted">{m.team_founders({}, o)}</p>
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
