"use client";
import { type FormEvent, type ReactElement, useId, useState } from "react";
import type { SetupPractitioner } from "../../platform/scheduling-model";
import { Card } from "../studio/controls";
import { dayLabel } from "./format";
import { IconCalendar } from "./icons";
import { type CardProps, fill, type T } from "./types";

interface Off {
	date: string;
	who: Array<{ name: string; exception: string }>;
}

/** The whole days that are closed from today on, one row per date, one chip per person. */
function offDays(people: ReadonlyArray<SetupPractitioner>, today: string): Off[] {
	const byDate = new Map<string, Off>();
	for (const p of people) {
		for (const x of p.exceptions) {
			if (x.kind !== "closed" || x.start !== undefined || x.date < today) continue;
			const row = byDate.get(x.date) ?? { date: x.date, who: [] };
			row.who.push({ name: p.name, exception: x.id });
			byDate.set(x.date, row);
		}
	}
	return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Days off: holidays and leave, for the whole team or one person, a day or a range of days. */
export function DaysOffCard({
	people,
	today,
	language,
	t,
	canEdit,
	busy,
	run,
}: CardProps & {
	people: ReadonlyArray<SetupPractitioner>;
	today: string;
	language: string;
	t: T;
}): ReactElement {
	const id = useId();
	const [who, setWho] = useState("all");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const active = people.filter((p) => p.active);
	const rows = offDays(people, today);

	const add = async (e: FormEvent): Promise<void> => {
		e.preventDefault();
		const r = await run(
			"daysoff/add",
			{ practitioners: who === "all" ? "all" : [who], from, to: to === "" ? from : to },
			(data) => {
				const n = typeof data.added === "number" ? data.added : 0;
				return n === 0 ? t("psi:scOffNothing") : fill(t("psi:scOffAdded"), { n });
			},
		);
		if (r.ok) {
			setFrom("");
			setTo("");
		}
	};

	return (
		<Card
			id="daysoff"
			icon={<IconCalendar />}
			title={t("psi:scOffTitle")}
			hint={t("psi:scOffHint")}
		>
			{people.length === 0 ? <p className="psi-note">{t("psi:scOffWhoNone")}</p> : null}
			{rows.length === 0 && people.length > 0 ? (
				<p className="psi-dim">{t("psi:scOffNone")}</p>
			) : null}
			<ul className="psi-list">
				{rows.map((row) => (
					<li key={row.date} className="psi-list__item">
						<strong>{dayLabel(row.date, language)}</strong>
						<span className="psi-dim">{row.date}</span>
						<span className="psi-tags-inline">
							{row.who.map((w) => (
								<span key={w.exception} className="psi-range">
									{w.name}
									{canEdit ? (
										<button
											className="psi-tag__x"
											type="button"
											disabled={busy}
											aria-label={fill(t("psi:scOffRemove"), { date: `${row.date} (${w.name})` })}
											onClick={() => void run("daysoff/remove", { exception: w.exception })}
										>
											×
										</button>
									) : null}
								</span>
							))}
						</span>
					</li>
				))}
			</ul>
			{canEdit && people.length > 0 ? (
				<form className="psi-inline psi-rangeform" onSubmit={(e) => void add(e)}>
					<label htmlFor={`${id}-w`}>{t("psi:scOffWho")}</label>
					<select id={`${id}-w`} value={who} onChange={(e) => setWho(e.currentTarget.value)}>
						<option value="all">{t("psi:scOffAll")}</option>
						{active.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
					<label htmlFor={`${id}-f`}>{t("psi:scOffFrom")}</label>
					<input
						id={`${id}-f`}
						type="date"
						min={today}
						value={from}
						required
						onChange={(e) => setFrom(e.currentTarget.value)}
					/>
					<label htmlFor={`${id}-t`}>{t("psi:scOffTo")}</label>
					<input
						id={`${id}-t`}
						type="date"
						min={from || today}
						value={to}
						onChange={(e) => setTo(e.currentTarget.value)}
					/>
					<button className="psi-btn psi-btn--primary" type="submit" disabled={busy || from === ""}>
						{t("psi:scOffAdd")}
					</button>
				</form>
			) : null}
		</Card>
	);
}
