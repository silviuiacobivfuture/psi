"use client";
import { type FormEvent, type ReactElement, useId, useState } from "react";
import type { SetupState } from "../../platform/scheduling-model";
import type { Board, BoardAppointment } from "./api";
import { dayLabel, toMinutes, wallDate, wallTime } from "./format";
import type { Run, T } from "./types";

type By = "people" | "rooms";

/** The same events as a list by day, for a narrow screen (the grid hides below 700px). */
export function Agenda({
	board,
	zone,
	language,
	by,
	setup,
	nameOf,
	onPick,
	t,
}: {
	board: Board;
	zone: string;
	language: string;
	by: By;
	setup: SetupState;
	nameOf: (slug: string) => string;
	onPick: (reference: string) => void;
	t: T;
}): ReactElement {
	const byDay = new Map<string, BoardAppointment[]>();
	for (const a of [...board.appointments].sort((x, y) => x.start - y.start)) {
		const d = wallDate(a.start, zone);
		byDay.set(d, [...(byDay.get(d) ?? []), a]);
	}
	return (
		<div className="psi-cal__agenda">
			{[...byDay.entries()].map(([d, list]) => (
				<section key={d}>
					<h3 className="psi-slotday__date">{dayLabel(d, language)}</h3>
					<ul className="psi-list">
						{list.map((a) => (
							<li key={a.reference}>
								<button
									type="button"
									className={`psi-ev psi-ev--${a.status} psi-ev--row`}
									onClick={() => onPick(a.reference)}
								>
									<strong>{wallTime(a.start, zone)}</strong> {nameOf(a.serviceSlug)} ·{" "}
									{by === "people"
										? (setup.practitioners.find((p) => p.id === a.practitionerId)?.name ?? "")
										: (setup.rooms.find((r) => r.id === a.roomId)?.name ??
											t("psi:scCalNoRoom"))}{" "}
									<span className="psi-dim">
										(
										{t(
											`psi:scSt_${a.status === "held" ? "held" : a.status === "requested" ? "requested" : "confirmed"}`,
										)}
										)
									</span>
								</button>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}

/** One-off exceptions in two clicks: a practitioner's day off, or a room out of use. */
export function QuickAdd({
	setup,
	busy,
	run,
	t,
}: {
	setup: SetupState;
	busy: boolean;
	run: Run;
	t: T;
}): ReactElement {
	const id = useId();
	const [kind, setKind] = useState<"person" | "room">("person");
	const [who, setWho] = useState("");
	const [date, setDate] = useState("");
	const [a, setA] = useState("");
	const [b, setB] = useState("");
	const options =
		kind === "person"
			? setup.practitioners.filter((p) => p.active)
			: setup.rooms.filter((r) => r.active);
	const target = options.find((o) => o.id === who)?.id ?? options[0]?.id ?? "";
	const start = toMinutes(a);
	const end = toMinutes(b);
	const submit = async (e: FormEvent): Promise<void> => {
		e.preventDefault();
		if (kind === "person") {
			await run("daysoff/add", { practitioners: [target], from: date, to: date });
		} else {
			await run("room/closure/add", {
				room: target,
				from: date,
				to: date,
				...(start !== null && end !== null && start < end ? { start, end } : {}),
			});
		}
		setDate("");
	};
	return (
		<details className="psi-more psi-quick">
			<summary>{t("psi:scCalQuick")}</summary>
			<form className="psi-inline psi-rangeform" onSubmit={(e) => void submit(e)}>
				<select
					aria-label={t("psi:scCalQuick")}
					value={kind}
					onChange={(e) => setKind(e.currentTarget.value === "room" ? "room" : "person")}
				>
					<option value="person">{t("psi:scCalQuickDay")}</option>
					<option value="room">{t("psi:scCalQuickRoom")}</option>
				</select>
				<label htmlFor={`${id}-w`}>{t("psi:scCalWho")}</label>
				<select id={`${id}-w`} value={target} onChange={(e) => setWho(e.currentTarget.value)}>
					{options.map((o) => (
						<option key={o.id} value={o.id}>
							{"name" in o ? o.name : ""}
						</option>
					))}
				</select>
				<label htmlFor={`${id}-d`}>{t("psi:scCalDate")}</label>
				<input
					id={`${id}-d`}
					type="date"
					value={date}
					required
					onChange={(e) => setDate(e.currentTarget.value)}
				/>
				{kind === "room" ? (
					<>
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
					</>
				) : null}
				<button
					className="psi-btn psi-btn--primary psi-btn--sm"
					type="submit"
					disabled={busy || date === "" || target === ""}
				>
					{t("psi:scOffAdd")}
				</button>
			</form>
		</details>
	);
}
