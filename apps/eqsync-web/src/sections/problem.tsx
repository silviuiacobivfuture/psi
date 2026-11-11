import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** Three ruled rows, like an index: number, name, one plain line. */
export function Problem({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const rows = [
		{ n: "01", title: m.problem_1_title({}, o), text: m.problem_1_text({}, o) },
		{ n: "02", title: m.problem_2_title({}, o), text: m.problem_2_text({}, o) },
		{ n: "03", title: m.problem_3_title({}, o), text: m.problem_3_text({}, o) },
	];
	return (
		<section class="mx-auto max-w-6xl px-5 py-24 md:py-32">
			<div class="grid grid-cols-1 gap-10 lg:grid-cols-12">
				<div class="lg:sticky lg:top-32 lg:col-span-5 lg:self-start">
					<p class="eq-overline">{m.problem_overline({}, o)}</p>
					<h2 class="display eq-h2 pz-rise mt-5 text-ink">{m.problem_title({}, o)}</h2>
				</div>
				<ol class="eq-rows lg:col-span-7 lg:pt-10">
					{rows.map((r) => (
						<li class="eq-row pz-rise">
							<span class="eq-row__n">{r.n}</span>
							<h3 class="eq-row__title">{r.title}</h3>
							<p class="eq-row__text">{r.text}</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
