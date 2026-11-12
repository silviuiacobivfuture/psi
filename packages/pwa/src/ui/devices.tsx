/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { PUSH_PATHS } from "../push/api";

export interface DeviceRow {
	id: string;
	/** Where it was turned on, e.g. "Psizone". */
	site: string;
	/** Since when and what it receives, worded by the app (one message with parameters). */
	detail: string;
}

export interface DeviceListProps {
	rows: ReadonlyArray<DeviceRow>;
	locale: "ro" | "en";
	labels: { title: string; empty: string; remove: string };
}

/**
 * A signed-in person's browsers that receive notifications, on every psi site, each with a
 * remove button (a plain form, so it works without JavaScript).
 */
export function DeviceList({ rows, locale, labels }: DeviceListProps): JSX.Element {
	return (
		<section class="flex flex-col gap-3">
			<h2 class="text-heading-sm text-ink">{labels.title}</h2>
			{rows.length === 0 ? (
				<p class="text-body-sm text-ink-muted">{labels.empty}</p>
			) : (
				<ul class="flex flex-col gap-2">
					{rows.map((r) => (
						<li class="pz-edge flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-1 p-4">
							<div class="min-w-0">
								<p class="text-body text-ink">{r.site}</p>
								<p class="text-body-sm text-ink-muted">{r.detail}</p>
							</div>
							<form method="post" action={PUSH_PATHS.removeDevice}>
								<input type="hidden" name="id" value={r.id} />
								<input type="hidden" name="locale" value={locale} />
								<button type="submit" class="pz-btn pz-btn--glass pz-btn--sm">
									{labels.remove}
								</button>
							</form>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
