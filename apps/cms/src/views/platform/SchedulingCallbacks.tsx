import type { CallbackRow } from "@psi/scheduling";
import type { ReactElement } from "react";
import type { Brand } from "../../authz/types";
import { cell } from "../shell";
import { buttonStyle, muted, type Say, Table, word } from "./parts";
import { wall } from "./time";

/** The callback requests: who asked, how to reach them, when to call, and the "handled" mark. */
export function CallbacksTable({
	brand,
	rows,
	timeZone,
	manager,
	onlyNew,
	say,
}: {
	brand: Brand;
	rows: ReadonlyArray<CallbackRow>;
	timeZone: string;
	manager: boolean;
	onlyNew: boolean;
	say: Say;
}): ReactElement {
	return (
		<>
			<p style={muted}>{say("cbIntro")}</p>
			<form method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}>
				<input type="hidden" name="brand" value={brand} />
				<input type="hidden" name="tab" value="callbacks" />
				<label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
					<input type="checkbox" name="only" value="new" defaultChecked={onlyNew} />
					{say("cbFilterNew")}
				</label>
				<button type="submit" style={buttonStyle}>
					{say("filterApply")}
				</button>
			</form>
			{rows.length === 0 ? (
				<p>{say("cbNone")}</p>
			) : (
				<Table
					head={[
						say("cbColReceived"),
						say("colContact"),
						say("cbColFor"),
						say("cbColWhen"),
						say("cbColPage"),
						say("colStatus"),
						...(manager ? [say("colActions")] : []),
					]}
				>
					{rows.map((r) => (
						<tr key={r.id}>
							<td style={cell}>{wall(r.createdAt, timeZone)}</td>
							<td style={cell}>
								{r.contact === undefined ? (
									<span style={muted}>{say("cbContactErased")}</span>
								) : (
									<>
										{r.contact.name}
										{r.contact.phone === undefined ? null : (
											<div>
												<a href={`tel:${r.contact.phone.replace(/[^0-9+]/g, "")}`}>
													{r.contact.phone}
												</a>
											</div>
										)}
										{r.contact.email === undefined ? null : (
											<div>
												<a href={`mailto:${r.contact.email}`}>{r.contact.email}</a>
											</div>
										)}
									</>
								)}
							</td>
							<td style={cell}>{word(say, "cbAudience", r.audience)}</td>
							<td style={cell}>
								{word(say, "cbWhen", r.when)}
								{r.preferredStart === undefined ? null : (
									<div style={muted}>{wall(r.preferredStart, timeZone)}</div>
								)}
								{r.service === undefined ? null : <div style={muted}>{r.service}</div>}
							</td>
							<td style={cell}>
								<code>{r.page}</code> <span style={muted}>({word(say, "channel", r.channel)})</span>
							</td>
							<td style={cell}>
								{r.status === "handled"
									? `${say("cbHandledAt")}${r.handledAt === undefined ? "" : ` ${wall(r.handledAt, timeZone)}`}`
									: say("cbFilterNew")}
							</td>
							{manager ? (
								<td style={cell}>
									{r.status === "new" ? (
										<form method="post" action="/api/platform/scheduling/callback-handled">
											<input type="hidden" name="brand" value={brand} />
											<input type="hidden" name="id" value={r.id} />
											<button type="submit" style={buttonStyle}>
												{say("cbHandle")}
											</button>
										</form>
									) : null}
								</td>
							) : null}
						</tr>
					))}
				</Table>
			)}
		</>
	);
}
