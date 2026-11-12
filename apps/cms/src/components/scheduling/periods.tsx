"use client";
import { type FormEvent, type ReactElement, useId, useState } from "react";
import type { SetupPractitioner } from "../../platform/scheduling-model";
import { hhmm, toMinutes } from "./format";
import { type CardProps, fill, type T } from "./types";

const DAY_KEYS = [
	"psi:day_1",
	"psi:day_2",
	"psi:day_3",
	"psi:day_4",
	"psi:day_5",
	"psi:day_6",
	"psi:day_7",
] as const;

interface Period {
	from: string;
	until: string | null;
	lines: string[];
}

/** The period schedules of one person: their override rules grouped by start date. */
function periodsOf(person: SetupPractitioner, t: T): Period[] {
	const byFrom = new Map<string, Period>();
	for (const r of (person.rules ?? []).filter(
		(x) => x.override === true && x.validFrom !== undefined,
	)) {
		const from = r.validFrom ?? "";
		const p = byFrom.get(from) ?? { from, until: r.validUntil ?? null, lines: [] };
		p.lines.push(
			`${t(DAY_KEYS[r.weekday - 1] ?? "psi:day_1")} ${hhmm(r.start)}–${hhmm(r.end)}${r.week === undefined ? "" : ` (${r.week})`}`,
		);
		byFrom.set(from, p);
	}
	return [...byFrom.values()].sort((a, b) => a.from.localeCompare(b.from));
}

/** Hours that replace the regular week between two dates (a school holiday, a summer rota). */
export function Periods({
	person,
	today,
	t,
	canEdit,
	busy,
	run,
}: CardProps & { person: SetupPractitioner; today: string; t: T }): ReactElement {
	const id = useId();
	const [from, setFrom] = useState("");
	const [until, setUntil] = useState("");
	const [days, setDays] = useState<number[]>([1, 2, 3, 4]);
	const [a, setA] = useState("10:00");
	const [b, setB] = useState("14:00");
	const list = periodsOf(person, t);
	const start = toMinutes(a);
	const end = toMinutes(b);
	const valid = from !== "" && days.length > 0 && start !== null && end !== null && start < end;

	const submit = async (e: FormEvent): Promise<void> => {
		e.preventDefault();
		if (start === null || end === null) return;
		const r = await run("hours/period/set", {
			practitioner: person.id,
			from,
			...(until === "" ? {} : { until }),
			days: days.map((weekday) => ({
				weekday,
				windows: [{ start, end, modes: ["onsite", "online"] }],
			})),
		});
		if (r.ok) {
			setFrom("");
			setUntil("");
		}
	};

	return (
		<div className="psi-periods">
			<h3 className="psi-sub">{t("psi:scPeriodsTitle")}</h3>
			<p className="psi-sc__hint">{t("psi:scPeriodsHint")}</p>
			<ul className="psi-list">
				{list.map((p) => (
					<li key={p.from} className="psi-list__item">
						<div className="psi-list__main">
							<strong>
								{p.from} – {p.until ?? t("psi:scPeriodOpen")}
							</strong>
							<span className="psi-dim">{p.lines.join(" · ")}</span>
						</div>
						{canEdit ? (
							<button
								className="psi-tag__x"
								type="button"
								disabled={busy}
								aria-label={fill(t("psi:scPeriodRemove"), { from: p.from })}
								onClick={() =>
									void run("hours/period/remove", { practitioner: person.id, from: p.from })
								}
							>
								×
							</button>
						) : null}
					</li>
				))}
			</ul>
			{canEdit ? (
				<form className="psi-inline psi-rangeform" onSubmit={(e) => void submit(e)}>
					<label htmlFor={`${id}-f`}>{t("psi:scPeriodFrom")}</label>
					<input
						id={`${id}-f`}
						type="date"
						min={today}
						value={from}
						required
						onChange={(e) => setFrom(e.currentTarget.value)}
					/>
					<label htmlFor={`${id}-u`}>{t("psi:scPeriodUntil")}</label>
					<input
						id={`${id}-u`}
						type="date"
						min={from || today}
						value={until}
						onChange={(e) => setUntil(e.currentTarget.value)}
					/>
					<fieldset className="psi-checks">
						<legend className="psi-visually-hidden">{t("psi:scPeriodDays")}</legend>
						{DAY_KEYS.map((k, i) => (
							<label key={k} className="psi-check">
								<input
									type="checkbox"
									checked={days.includes(i + 1)}
									onChange={(e) =>
										setDays(
											e.currentTarget.checked ? [...days, i + 1] : days.filter((d) => d !== i + 1),
										)
									}
								/>
								{t(k).slice(0, 3)}
							</label>
						))}
					</fieldset>
					<label htmlFor={`${id}-a`}>{t("psi:scFrom")}</label>
					<input
						id={`${id}-a`}
						type="time"
						step={300}
						value={a}
						onChange={(e) => setA(e.currentTarget.value)}
					/>
					<label htmlFor={`${id}-b`}>{t("psi:scTo")}</label>
					<input
						id={`${id}-b`}
						type="time"
						step={300}
						value={b}
						onChange={(e) => setB(e.currentTarget.value)}
					/>
					<button
						className="psi-btn psi-btn--primary psi-btn--sm"
						type="submit"
						disabled={busy || !valid}
					>
						{t("psi:scPeriodAdd")}
					</button>
				</form>
			) : null}
		</div>
	);
}
