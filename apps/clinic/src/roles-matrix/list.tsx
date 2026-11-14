import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { areaLabel, resourceText, rowText } from "./labels";
import { ColumnHead, columnName, FoldView, MarkView } from "./marks";
import { type AreaRows, type Column, foldOf, markOf } from "./model";

export interface ListProps {
	areas: ReadonlyArray<AreaRows>;
	/** The role shown (one), or the two compared. */
	columns: ReadonlyArray<Column>;
	yours: ReadonlySet<string>;
	locale: Locale;
}

/**
 * The phone view: one role (or the two compared) at a time, each area a section that opens to its resources and
 * actions, one line each. Nothing is wider than the screen.
 */
export function MatrixList({ areas, columns, yours, locale }: ListProps): JSX.Element {
	const o = at(locale);
	const two = columns.length > 1;
	return (
		<section class="rm-phone rm-list" aria-label={m.rm_list_label({}, o)} data-view="list">
			<div class="rm-list__who">
				{columns.map((c) => (
					<div key={c.id} class={`adm-card rm-list__col${yours.has(c.id) ? " rm-yours" : ""}`}>
						<ColumnHead column={c} yours={yours.has(c.id)} locale={locale} />
					</div>
				))}
			</div>
			{areas.map((a) => {
				const rows = a.resources.flatMap((r) => r.rows);
				return (
					<details key={a.area} class="adm-card rm-list__area" data-area={a.area}>
						<summary>
							<span class="rm-list__area-name">{areaLabel(a.area, locale)}</span>
							<span class="rm-list__folds">
								{columns.map((c) => (
									<FoldView key={c.id} fold={foldOf(c, rows)} locale={locale} />
								))}
							</span>
						</summary>
						{a.resources.map((r) => (
							<div key={r.resource} class="rm-list__resource" data-resource={r.resource}>
								<h3 class="rm-list__res-name">{resourceText(r.resource, locale)}</h3>
								<ul>
									{r.rows.map((row) => (
										<li key={row.id} data-row={row.id}>
											<span class="rm-list__action">{rowText(row, locale)}</span>
											<span class="rm-list__marks">
												{columns.map((c) => (
													<span
														key={c.id}
														class="rm-list__mark"
														data-cell={row.id}
														data-col={c.id}
														data-mark={markOf(c, row)}
													>
														{two ? (
															<span class="adm-sr">{`${columnName(c, locale)}: `}</span>
														) : null}
														<MarkView mark={markOf(c, row)} locale={locale} />
													</span>
												))}
											</span>
										</li>
									))}
								</ul>
							</div>
						))}
					</details>
				);
			})}
		</section>
	);
}
