"use client";
import { type FormEvent, type ReactElement, useId, useState } from "react";
import type {
	SetupMode,
	SetupPractitioner,
	SetupRule,
	SetupService,
} from "../../platform/scheduling-model";
import { Card, Segmented, Toggle } from "../studio/controls";
import { mondayOf } from "./calendar-layout";
import { hhmm, overlaps, toMinutes } from "./format";
import { IconClock } from "./icons";
import { Periods } from "./periods";
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

interface Opening {
	start: number;
	end: number;
	modes: SetupMode[];
}

const windowOf = (r: SetupRule): Opening => ({ start: r.start, end: r.end, modes: r.modes });

/** One weekday: its ranges as removable chips, a form to add one, and copying to other days. */
function DayRow({
	weekday,
	label,
	person,
	week,
	offered,
	t,
	canEdit,
	busy,
	run,
}: CardProps & {
	/** The alternating week these hours are for; undefined: every week. */
	week: "A" | "B" | undefined;
	weekday: number;
	label: string;
	person: SetupPractitioner;
	/** The modes this person's services offer: a new range defaults to all of them. */
	offered: SetupMode[];
	t: T;
}): ReactElement {
	const id = useId();
	const regular = (person.rules ?? [])
		.filter((r) => r.weekday === weekday && !r.dated && r.week === week)
		.sort((a, b) => a.start - b.start);
	const [adding, setAdding] = useState(false);
	const [from, setFrom] = useState("09:00");
	const [to, setTo] = useState("13:00");
	const [modes, setModes] = useState<SetupMode[]>(offered);
	const [bad, setBad] = useState(false);

	const save = (weekdays: number[], windows: Opening[]) =>
		run("hours/day", {
			practitioner: person.id,
			weekdays,
			windows,
			...(week === undefined ? {} : { week }),
		});

	const add = async (e: FormEvent): Promise<void> => {
		e.preventDefault();
		const start = toMinutes(from);
		const end = toMinutes(to);
		const next = start === null || end === null ? null : { start, end, modes };
		if (
			next === null ||
			next.start >= next.end ||
			modes.length === 0 ||
			regular.some((r) => overlaps(r, next))
		) {
			setBad(true);
			return;
		}
		setBad(false);
		const r = await save([weekday], [...regular.map(windowOf), next]);
		if (r.ok) setAdding(false);
	};
	const mode = (m: SetupMode): string =>
		m === "onsite" ? t("psi:scModeOnsite") : t("psi:scModeOnline");
	const copy = (weekdays: number[]) => save(weekdays, regular.map(windowOf));

	return (
		<div className="psi-day">
			<div className="psi-day__name">{label}</div>
			<div className="psi-day__body">
				<ul className="psi-ranges">
					{regular.length === 0 ? <li className="psi-dim">{t("psi:scDayFree")}</li> : null}
					{regular.map((r) => (
						<li key={r.id} className="psi-range">
							<span>
								{hhmm(r.start)}–{hhmm(r.end)}
							</span>
							{offered.length > 1 && r.modes.length === 1 ? (
								<span className="psi-range__mode">{mode(r.modes[0] ?? "onsite")}</span>
							) : null}
							{canEdit ? (
								<button
									className="psi-tag__x"
									type="button"
									disabled={busy}
									aria-label={fill(t("psi:scRangeRemove"), {
										range: `${hhmm(r.start)}–${hhmm(r.end)}`,
									})}
									onClick={() =>
										void save([weekday], regular.filter((x) => x.id !== r.id).map(windowOf))
									}
								>
									×
								</button>
							) : null}
						</li>
					))}
				</ul>
				{canEdit && !adding ? (
					<div className="psi-day__actions">
						<button
							className="psi-chip psi-chip--add"
							type="button"
							onClick={() => {
								setAdding(true);
								setModes(offered);
							}}
						>
							+ {t("psi:scAddRange")}
						</button>
						{regular.length > 0 ? (
							<>
								<button
									className="psi-btn psi-btn--link"
									type="button"
									disabled={busy}
									onClick={() => void copy([1, 2, 3, 4, 5])}
								>
									{fill(t("psi:scCopyDay"), { day: label })} {t("psi:scCopyWeek")}
								</button>
								<button
									className="psi-btn psi-btn--link"
									type="button"
									disabled={busy}
									onClick={() => void copy([1, 2, 3, 4, 5, 6, 7])}
								>
									{t("psi:scCopyAll")}
								</button>
							</>
						) : null}
					</div>
				) : null}
				{adding ? (
					<form className="psi-inline psi-rangeform" onSubmit={(e) => void add(e)}>
						<label htmlFor={`${id}-f`}>{t("psi:scFrom")}</label>
						<input
							id={`${id}-f`}
							type="time"
							step={300}
							value={from}
							required
							onChange={(e) => setFrom(e.currentTarget.value)}
						/>
						<label htmlFor={`${id}-t`}>{t("psi:scTo")}</label>
						<input
							id={`${id}-t`}
							type="time"
							step={300}
							value={to}
							required
							onChange={(e) => setTo(e.currentTarget.value)}
						/>
						{offered.length > 1 ? (
							<fieldset className="psi-checks">
								<legend className="psi-visually-hidden">{label}</legend>
								{offered.map((m) => (
									<label key={m} className="psi-check">
										<input
											type="checkbox"
											checked={modes.includes(m)}
											onChange={(e) =>
												setModes(
													e.currentTarget.checked ? [...modes, m] : modes.filter((x) => x !== m),
												)
											}
										/>
										{mode(m)}
									</label>
								))}
							</fieldset>
						) : null}
						<button className="psi-btn psi-btn--primary psi-btn--sm" type="submit" disabled={busy}>
							{t("psi:scSave")}
						</button>
						<button
							className="psi-btn psi-btn--ghost psi-btn--sm"
							type="button"
							onClick={() => {
								setAdding(false);
								setBad(false);
							}}
						>
							{t("psi:scCancel")}
						</button>
						{bad ? (
							<p className="psi-note psi-note--warn" role="alert">
								{t("psi:scRangeBad")}
							</p>
						) : null}
					</form>
				) : null}
			</div>
		</div>
	);
}

/** The regular week of one practitioner, and the date-bound ranges they may also have. */
export function HoursCard({
	people,
	services,
	t,
	canEdit,
	busy,
	run,
	today,
}: CardProps & {
	people: ReadonlyArray<SetupPractitioner>;
	services: ReadonlyArray<SetupService>;
	today: string;
	t: T;
}): ReactElement {
	const [pick, setPick] = useState<string | null>(null);
	const [week, setWeek] = useState<"A" | "B">("A");
	const person = people.find((p) => p.id === pick) ?? people.find((p) => p.active) ?? people[0];
	const pickId = useId();
	const offered = (p: SetupPractitioner): SetupMode[] => {
		const own = services.filter((s) => s.practitioners.includes(p.id));
		const modes = (own.length === 0 ? services : own).flatMap((s) => s.modes);
		const set = [...new Set(modes)];
		return set.length === 0 ? ["onsite", "online"] : set;
	};
	const dated = (person?.rules ?? []).filter((r) => r.dated && r.override !== true);

	return (
		<Card id="hours" icon={<IconClock />} title={t("psi:scHoursTitle")} hint={t("psi:scHoursHint")}>
			{person === undefined ? (
				<p className="psi-note">{t("psi:scHoursNoPerson")}</p>
			) : (
				<>
					{people.length > 1 ? (
						<div className="psi-inline">
							<label htmlFor={pickId}>{t("psi:scHoursWho")}</label>
							<select
								id={pickId}
								value={person.id}
								onChange={(e) => setPick(e.currentTarget.value)}
							>
								{people.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
						</div>
					) : null}
					{canEdit || person.abAnchor !== null ? (
						<div className="psi-alt">
							<Toggle
								label={t("psi:scAltTitle")}
								checked={person.abAnchor !== null}
								disabled={!canEdit || busy}
								onLabel={t("psi:scAltTitle")}
								offLabel={t("psi:scAltTitle")}
								onChange={(on) =>
									void run("hours/alternating", {
										practitioner: person.id,
										anchor: on ? mondayOf(today) : null,
									})
								}
							/>
							{person.abAnchor === null ? null : (
								<>
									<p className="psi-sc__hint">{t("psi:scAltHelp")}</p>
									<Segmented
										name="week"
										label={t("psi:scAltTitle")}
										size="sm"
										value={week}
										options={[
											{ value: "A", label: t("psi:scWeekA") },
											{ value: "B", label: t("psi:scWeekB") },
										]}
										onChange={setWeek}
									/>
								</>
							)}
						</div>
					) : null}
					{person.rules === null ? (
						<p className="psi-note psi-note--warn">{t("psi:scErr_unreachable")}</p>
					) : (
						<div className="psi-week">
							{DAY_KEYS.map((key, i) => (
								<DayRow
									key={key}
									weekday={i + 1}
									week={person.abAnchor === null ? undefined : week}
									label={t(key)}
									person={person}
									offered={offered(person)}
									t={t}
									canEdit={canEdit}
									busy={busy}
									run={run}
								/>
							))}
						</div>
					)}
					{dated.length > 0 ? (
						<div>
							<h3 className="psi-sub">{t("psi:scDated")}</h3>
							<p className="psi-sc__hint">{t("psi:scDatedHint")}</p>
							<ul className="psi-ranges">
								{dated.map((r) => (
									<li key={r.id} className="psi-range">
										<span>
											{t(DAY_KEYS[r.weekday - 1] ?? "psi:day_1")} {hhmm(r.start)}–{hhmm(r.end)}
											{r.validFrom === undefined ? "" : ` · ${t("psi:scSince")} ${r.validFrom}`}
											{r.validUntil === undefined ? "" : ` · ${t("psi:scUntil")} ${r.validUntil}`}
										</span>
										{canEdit ? (
											<button
												className="psi-tag__x"
												type="button"
												disabled={busy}
												aria-label={fill(t("psi:scRangeRemove"), {
													range: `${hhmm(r.start)}–${hhmm(r.end)}`,
												})}
												onClick={() => void run("hours/rule/remove", { rule: r.id })}
											>
												×
											</button>
										) : null}
									</li>
								))}
							</ul>
						</div>
					) : null}
					<Periods person={person} today={today} t={t} canEdit={canEdit} busy={busy} run={run} />
					<p className="psi-sc__hint">{fill(t("psi:scZoneNote"), { zone: "Europe/Bucharest" })}</p>
				</>
			)}
		</Card>
	);
}
