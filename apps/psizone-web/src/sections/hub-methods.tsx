import type { JSX } from "hono/jsx/jsx-runtime";
import type { Hub } from "../content/hubs";
import { methodsForHub } from "../content/methods";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/**
 * A hub's second door: the methods used for it and related pages. Clinical methods only
 * (`methodsForHub`): a hub page never promotes EQ-Sync or Hemi-Sync.
 */
export function HubMethods({ hub, locale }: { hub: Hub; locale: Locale }): JSX.Element | null {
	const o = at(locale);
	const b = base(locale);
	const methods = methodsForHub(hub.id);
	const related = hub.related ?? [];
	if (methods.length === 0 && related.length === 0) return null;
	const pill =
		"pz-rise inline-block rounded-pill border border-line-control px-6 py-3 text-title text-ink hover:border-accent hover:text-glow-1";
	return (
		<section class="border-t border-line bg-surface-1">
			<div class="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-2">
				{methods.length > 0 ? (
					<div>
						<h2 class="text-overline uppercase tracking-[0.14em] text-ink-muted">
							{m.hub_methods_overline({}, o)}
						</h2>
						<ul class="mt-6 flex flex-wrap gap-3">
							{methods.map((x) => (
								<li>
									<a class={pill} href={`${b}${x.path}`}>
										{x.name[locale]}
									</a>
								</li>
							))}
						</ul>
					</div>
				) : null}
				{related.length > 0 ? (
					<div>
						<h2 class="text-overline uppercase tracking-[0.14em] text-ink-muted">
							{m.hub_related({}, o)}
						</h2>
						<ul class="mt-6 flex flex-wrap gap-3">
							{related.map((r) => (
								<li>
									<a class={pill} href={`${b}${r.href}`}>
										{r.label(o)}
									</a>
								</li>
							))}
						</ul>
					</div>
				) : null}
			</div>
		</section>
	);
}
