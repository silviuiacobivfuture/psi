import type { JSX } from "hono/jsx/jsx-runtime";

/** The numbers behind a chart, as a real table: the chart is a picture of it, never the only way to read it. */
export function DataTable({
	caption,
	head,
	rows,
	scroll = false,
}: {
	caption: string;
	head: ReadonlyArray<string>;
	rows: ReadonlyArray<ReadonlyArray<string>>;
	/** A long table keeps its own height and scrolls (reachable by keyboard). */
	scroll?: boolean;
}): JSX.Element {
	return (
		<section
			class={scroll ? "adm-scroll stat-table stat-table--tall" : "adm-scroll stat-table"}
			tabindex={0}
			aria-label={caption}
		>
			<table class="adm-table">
				<caption class="adm-sr">{caption}</caption>
				<thead>
					<tr>
						{head.map((h, i) => (
							<th key={h} scope="col" class={i === 0 ? undefined : "stat-num"}>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr key={r.join("|")}>
							{r.map((cell, i) =>
								i === 0 ? (
									<th key={`${r[0]}-h`} scope="row">
										{cell}
									</th>
								) : (
									// biome-ignore lint/suspicious/noArrayIndexKey: a row's cells are positional, and the head is too
									<td key={i} class="stat-num">
										{cell}
									</td>
								),
							)}
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}
