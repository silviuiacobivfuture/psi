/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";

export interface MatrixRow {
	key: string;
	label: string;
	group: string;
}
export interface MatrixColumn {
	key: string;
	label: string;
}
export interface MatrixScope {
	key: string;
	label: string;
}
export interface FieldGroupToggle {
	key: string;
	label: string;
	on: boolean;
}

export interface PermissionMatrixProps {
	rows: ReadonlyArray<MatrixRow>;
	columns: ReadonlyArray<MatrixColumn>;
	/** The scopes a grant can have, besides "none": all, assigned, own. */
	scopes: ReadonlyArray<MatrixScope>;
	noneLabel: string;
	notApplicableLabel: string;
	/** `grants[row][column]` = a scope key; absent = none. */
	grants: Readonly<Record<string, Readonly<Record<string, string>>>>;
	/** `applicable[row]` = the columns that make sense for the row; the rest are not offered. */
	applicable: Readonly<Record<string, ReadonlyArray<string>>>;
	fieldGroupsLabel: string;
	fieldGroups: ReadonlyArray<FieldGroupToggle>;
	resourceLabel: string;
	readOnly?: boolean;
	tableLabel: string;
}

/** Resource rows by action columns, a scope select in each cell, then the field-group toggles. */
export function PermissionMatrix(p: PermissionMatrixProps): JSX.Element {
	let group = "";
	return (
		<div class="adm-stack">
			<section class="adm-scroll" tabindex={0} aria-label={p.tableLabel}>
				<table class="adm-table adm-matrix">
					<thead>
						<tr>
							<th scope="col">{p.resourceLabel}</th>
							{p.columns.map((c) => (
								<th key={c.key} scope="col">
									{c.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{p.rows.map((r) => {
							const heading = r.group !== group;
							group = r.group;
							const cols = p.applicable[r.key] ?? [];
							return (
								<>
									{heading ? (
										<tr key={`g-${r.group}`}>
											<th colspan={p.columns.length + 1} scope="colgroup" class="adm-muted">
												{r.group}
											</th>
										</tr>
									) : null}
									<tr key={r.key}>
										<th scope="row">{r.label}</th>
										{p.columns.map((c) => {
											const current = p.grants[r.key]?.[c.key] ?? "none";
											if (!cols.includes(c.key))
												return (
													<td key={c.key} class="adm-muted" aria-label={p.notApplicableLabel}>
														&ndash;
													</td>
												);
											const name = `perm.${r.key}.${c.key}`;
											return (
												<td key={c.key} class="adm-matrix__cell">
													<select
														class="adm-matrix__scope"
														name={name}
														aria-label={`${r.label}: ${c.label}`}
														disabled={p.readOnly === true}
													>
														<option value="none" selected={current === "none"}>
															{p.noneLabel}
														</option>
														{p.scopes.map((s) => (
															<option key={s.key} value={s.key} selected={current === s.key}>
																{s.label}
															</option>
														))}
													</select>
												</td>
											);
										})}
									</tr>
								</>
							);
						})}
					</tbody>
				</table>
			</section>
			<fieldset class="adm-card">
				<legend class="adm-h2">{p.fieldGroupsLabel}</legend>
				<div class="adm-row">
					{p.fieldGroups.map((f) => (
						<label key={f.key} class="adm-check">
							<input
								type="checkbox"
								name={`field.${f.key}`}
								checked={f.on}
								disabled={p.readOnly === true}
							/>
							{f.label}
						</label>
					))}
				</div>
			</fieldset>
		</div>
	);
}
