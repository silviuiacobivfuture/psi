import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { areaLabel, resourceText, rowText } from "./labels";
import { ColumnHead, FoldView, MarkView } from "./marks";
import { type AreaRows, type Column, foldOf, markOf } from "./model";

/** The Datastar signal that opens a resource's actions: `rmoAppSettings`. */
const signalOf = (resource: string): string =>
	`rmo${resource.replace(/(^|_)([a-z])/g, (_, __: string, ch: string) => ch.toUpperCase())}`;

export interface TableProps {
	areas: ReadonlyArray<AreaRows>;
	columns: ReadonlyArray<Column>;
	yours: ReadonlySet<string>;
	/** Every action shown, not only each resource's summary (the "every action" view and the differences). */
	expanded: boolean;
	locale: Locale;
}

/**
 * The desktop view: areas and their resources down the side, the roles across, the header and the first column
 * sticky. A resource folds its actions into one mark; its button (or the "every action" view) shows them.
 */
export function MatrixTable({ areas, columns, yours, expanded, locale }: TableProps): JSX.Element {
	const o = at(locale);
	const signals = expanded
		? undefined
		: JSON.stringify(
				Object.fromEntries(
					areas.flatMap((a) => a.resources.map((r) => [signalOf(r.resource), false])),
				),
			);
	const yoursClass = (c: Column): string | undefined => (yours.has(c.id) ? "rm-yours" : undefined);
	return (
		<section
			class="adm-scroll rm-scroll rm-desktop"
			tabindex={0}
			aria-label={m.rm_table_label({}, o)}
			data-view="table"
			data-signals={signals}
		>
			<table class="adm-table rm-table">
				<thead>
					<tr>
						<th scope="col" class="rm-first">
							{m.rm_area_col({}, o)}
						</th>
						{columns.map((c) => (
							<th key={c.id} scope="col" data-col={c.id} class={yoursClass(c)}>
								<ColumnHead column={c} yours={yours.has(c.id)} locale={locale} />
							</th>
						))}
					</tr>
				</thead>
				{areas.map((a) => (
					<tbody key={a.area} data-area={a.area}>
						<tr class="rm-area">
							<th scope="colgroup" colspan={columns.length + 1}>
								<span class="rm-area__name">{areaLabel(a.area, locale)}</span>
							</th>
						</tr>
						{a.resources.flatMap((r) => {
							const name = resourceText(r.resource, locale);
							const signal = signalOf(r.resource);
							return [
								<tr key={r.resource} class="rm-resource" data-resource={r.resource}>
									<th scope="row" class="rm-first">
										{expanded ? (
											<span>{name}</span>
										) : (
											<button
												type="button"
												class="rm-toggle"
												aria-expanded="false"
												aria-label={m.rm_expand({ name }, o)}
												data-attr:aria-expanded={`$${signal} ? 'true' : 'false'`}
												data-on:click={`$${signal} = !$${signal}`}
											>
												<span aria-hidden="true" class="rm-toggle__icon">
													›
												</span>
												{name}
											</button>
										)}
									</th>
									{columns.map((c) => (
										<td
											key={c.id}
											data-fold={r.resource}
											data-col={c.id}
											data-mark={foldOf(c, r.rows)}
											class={yoursClass(c)}
										>
											<FoldView fold={foldOf(c, r.rows)} locale={locale} />
										</td>
									))}
								</tr>,
								...r.rows.map((row) => (
									<tr
										key={row.id}
										class="rm-action"
										data-row={row.id}
										{...(expanded ? {} : { "data-show": `$${signal}`, style: "display:none" })}
									>
										<th scope="row" class="rm-first rm-first--action">
											{rowText(row, locale)}
										</th>
										{columns.map((c) => (
											<td
												key={c.id}
												data-cell={row.id}
												data-col={c.id}
												data-mark={markOf(c, row)}
												class={yoursClass(c)}
											>
												<MarkView mark={markOf(c, row)} locale={locale} />
											</td>
										))}
									</tr>
								)),
							];
						})}
					</tbody>
				))}
			</table>
		</section>
	);
}
