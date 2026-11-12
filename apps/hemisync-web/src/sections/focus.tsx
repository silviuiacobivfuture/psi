import { FocusScale } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";

/** Focus 10, 12, 15, 21: the site's names, described as experience. Focus 21 wording awaits the owner. */
export function Focus({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const word = m.focus_word({}, o);
	return (
		<section id="focus" class="border-y border-line bg-surface-1">
			<div class="mx-auto max-w-7xl px-6 py-24 md:px-14 md:py-36">
				<div class="grid gap-8 lg:grid-cols-[7fr_5fr] lg:items-end">
					<div>
						<p class="hs-overline">{m.focus_overline({}, o)}</p>
						<h2 class="display pz-rise mt-4 text-display-lg text-ink">
							{m.focus_title_1({}, o)} <em>{m.focus_title_2({}, o)}</em>
						</h2>
					</div>
					<p class="text-body-lg text-ink-muted">{m.focus_lead({}, o)}</p>
				</div>
				<FocusScale
					class="mt-20"
					label={m.focus_list_label({}, o)}
					active={10}
					levels={[
						{ level: 10, label: word, name: m.focus_10_name({}, o), text: m.focus_10_text({}, o) },
						{ level: 12, label: word, name: m.focus_12_name({}, o), text: m.focus_12_text({}, o) },
						{ level: 15, label: word, name: m.focus_15_name({}, o), text: m.focus_15_text({}, o) },
						{ level: 21, label: word, name: m.focus_21_name({}, o), text: m.focus_21_text({}, o) },
					]}
				/>
				<div class="mt-16 flex flex-wrap items-baseline justify-between gap-6">
					<p class="text-body text-ink-faint">{m.focus_note({}, o)}</p>
					<a class="pz-tap text-link text-body" href={href(locale, "focus")}>
						{m.focus_more({}, o)}
					</a>
				</div>
			</div>
		</section>
	);
}
