/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface LedgerColumn {
	key: string;
	label: string;
	/** Numbers line up on the right. */
	align?: "end";
	/** Where the cell sits when the row stacks on a phone: top left, top right, or the line under. */
	slot?: "start" | "end" | "sub";
}

export interface LedgerRow {
	key: string;
	cells: Readonly<Record<string, Child>>;
}

export interface LedgerTableProps {
	/** Names the table for assistive technology. */
	caption: string;
	columns: ReadonlyArray<LedgerColumn>;
	rows: ReadonlyArray<LedgerRow>;
	/** Shown instead of rows when there are none. */
	empty: string;
	/** A last row that is not data: the "add" row. */
	footer?: Child;
}

/** A ledger: columns on a wide screen, a two-line row on a phone. A real table; CSS only changes how rows lay out. */
export function LedgerTable({
	caption,
	columns,
	rows,
	empty,
	footer,
}: LedgerTableProps): JSX.Element {
	return (
		<div class="adm-ledger" style={`--n:${columns.length}`}>
			<table class="adm-ledger__table" aria-label={caption}>
				<thead class="adm-ledger__headgroup">
					<tr class="adm-ledger__head">
						{columns.map((c) => (
							<th
								key={c.key}
								scope="col"
								class={cx("adm-ledger__th", c.align === "end" && "is-end")}
							>
								{c.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody class="adm-ledger__body">
					{rows.length === 0 ? (
						<tr class="adm-ledger__emptyrow">
							<td class="adm-ledger__empty adm-muted" colspan={columns.length}>
								{empty}
							</td>
						</tr>
					) : (
						rows.map((r) => (
							<tr key={r.key} class="adm-ledger__row">
								{columns.map((c) => (
									<td
										key={c.key}
										class={cx("adm-ledger__td", c.align === "end" && "is-end")}
										data-slot={c.slot ?? "sub"}
										data-col={c.key}
									>
										{r.cells[c.key]}
									</td>
								))}
							</tr>
						))
					)}
				</tbody>
			</table>
			{footer === undefined ? null : <div class="adm-ledger__foot">{footer}</div>}
		</div>
	);
}
