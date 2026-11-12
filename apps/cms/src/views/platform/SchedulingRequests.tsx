import { DECISION_REASONS, type StaffRequest } from "@psi/scheduling";
import type { ReactElement } from "react";
import type { Brand } from "../../authz/types";
import type { PsiKey } from "../../i18n";
import { cell } from "../shell";
import { buttonStyle, inputStyle, muted, type Say, Table, word } from "./parts";
import { wall } from "./time";

/** The requests table: who asked (name and one way to reach them), when, and the decisions. */
export const FILTER_STATUSES = ["requested", "confirmed", "declined", "cancelled"] as const;

function statusWord(say: Say, s: string): string {
	const k = `status_${s}`;
	const known: ReadonlyArray<PsiKey> = [
		"status_requested",
		"status_confirmed",
		"status_cancelled",
		"status_declined",
		"status_held",
		"status_expired",
	];
	const hit = known.find((x) => x === k);
	return hit === undefined ? s : say(hit);
}

function Reasons({ say }: { say: Say }): ReactElement {
	return (
		<select
			name="reason"
			aria-label={say("reason")}
			style={inputStyle}
			defaultValue="administrative"
		>
			{DECISION_REASONS.map((r) => {
				const key: PsiKey = `reason_${r}`;
				return (
					<option key={r} value={r}>
						{say(key)}
					</option>
				);
			})}
		</select>
	);
}

function Decide({
	brand,
	reference,
	decision,
	label,
	withReason,
	say,
}: {
	brand: Brand;
	reference: string;
	decision: "confirm" | "decline" | "cancel";
	label: string;
	withReason: boolean;
	say: Say;
}): ReactElement {
	return (
		<form
			method="post"
			action="/api/platform/scheduling/decide"
			style={{ display: "inline-flex", gap: 4, margin: 2 }}
		>
			<input type="hidden" name="brand" value={brand} />
			<input type="hidden" name="reference" value={reference} />
			<input type="hidden" name="decision" value={decision} />
			{withReason ? <Reasons say={say} /> : null}
			<button type="submit" style={buttonStyle}>
				{label}
			</button>
		</form>
	);
}

export function RequestsTable({
	brand,
	rows,
	timeZone,
	manager,
	status,
	say,
}: {
	brand: Brand;
	rows: ReadonlyArray<StaffRequest>;
	timeZone: string;
	manager: boolean;
	status: string;
	say: Say;
}): ReactElement {
	return (
		<>
			<form
				method="get"
				style={{ display: "flex", gap: 8, alignItems: "end", marginTop: "var(--base)" }}
			>
				<input type="hidden" name="brand" value={brand} />
				<label style={{ display: "grid", gap: 2 }}>
					<span style={muted}>{say("filterStatus")}</span>
					<select name="status" defaultValue={status} style={inputStyle}>
						<option value="">{say("filterAll")}</option>
						{FILTER_STATUSES.map((s) => (
							<option key={s} value={s}>
								{statusWord(say, s)}
							</option>
						))}
					</select>
				</label>
				<button type="submit" style={buttonStyle}>
					{say("filterApply")}
				</button>
			</form>
			{rows.length === 0 ? (
				<p>{say("noRequests")}</p>
			) : (
				<Table
					head={[
						say("colReference"),
						say("colWhen"),
						say("colPractitioner"),
						say("colContact"),
						say("colStatus"),
						say("colChannel"),
						...(manager ? [say("colActions")] : []),
					]}
				>
					{rows.map((r) => (
						<tr key={r.reference}>
							<td style={cell}>
								<code>{r.reference}</code>
							</td>
							<td style={cell}>
								{wall(r.start, timeZone)}{" "}
								<span style={muted}>
									({word(say, "mode", r.mode)}, {r.serviceSlug})
								</span>
							</td>
							<td style={cell}>{r.practitionerName}</td>
							<td style={cell}>
								{r.contact === undefined
									? "—"
									: `${r.contact.name} · ${r.contact.phone ?? r.contact.email ?? ""}`}
							</td>
							<td style={cell}>
								{statusWord(say, r.status)}
								{r.decisionReason === undefined ? null : (
									<div style={muted}>{say(`reason_${r.decisionReason}`)}</div>
								)}
							</td>
							<td style={cell}>{word(say, "channel", r.channel)}</td>
							{manager ? (
								<td style={cell}>
									{r.status === "requested" ? (
										<>
											<Decide
												brand={brand}
												reference={r.reference}
												decision="confirm"
												label={say("confirm")}
												withReason={false}
												say={say}
											/>
											<Decide
												brand={brand}
												reference={r.reference}
												decision="decline"
												label={say("decline")}
												withReason
												say={say}
											/>
										</>
									) : r.status === "confirmed" ? (
										<Decide
											brand={brand}
											reference={r.reference}
											decision="cancel"
											label={say("cancel")}
											withReason
											say={say}
										/>
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
