import type { JSX } from "hono/jsx/jsx-runtime";
import type { FaqEntry } from "../content/faq";
import { base, type Locale } from "../i18n";

/**
 * Questions as native `<details>`: no JS, keyboard and screen-reader friendly. A placeholder answer
 * part is shown bracketed, as everywhere else on the site.
 */
export function FaqList({
	locale,
	entries,
}: {
	locale: Locale;
	entries: ReadonlyArray<FaqEntry>;
}): JSX.Element {
	const b = base(locale);
	return (
		<div class="border-t border-line">
			{entries.map((e) => (
				<details id={`q-${e.id}`} class="group border-b border-line">
					<summary class="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-title text-ink marker:hidden">
						<span>{e.q[locale]}</span>
						<span
							class="font-mono text-body text-glow-1 transition-transform group-open:rotate-45"
							aria-hidden="true"
						>
							+
						</span>
					</summary>
					<div class="max-w-2xl space-y-3 pb-7">
						<p class="text-body-lg text-ink-muted">{e.a[locale]}</p>
						{e.placeholder ? (
							<p class="rounded-md border border-dashed border-line-control px-4 py-3 text-body-sm text-ink-muted">
								{`[${e.placeholder[locale]}]`}
							</p>
						) : null}
						{e.link ? (
							<a
								class="inline-block text-body font-semibold text-glow-1 hover:underline"
								href={`${b}${e.link.href}`}
							>
								{`${e.link.label[locale]} →`}
							</a>
						) : null}
					</div>
				</details>
			))}
		</div>
	);
}
