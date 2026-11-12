"use client";
import { ROOM_KINDS } from "@psi/scheduling/domain";
import { type FormEvent, type ReactElement, useId, useState } from "react";
import type { CustomKey } from "../../i18n";
import type { SetupRoom } from "../../platform/scheduling-model";
import { Card, Toggle } from "../studio/controls";
import { hhmm, toMinutes } from "./format";
import { IconRoom } from "./icons";
import { type CardProps, fill, type T } from "./types";

type Audience = "child" | "teen" | "adult";
const AUDIENCES: ReadonlyArray<Audience> = ["child", "teen", "adult"];
const kindKey = (k: string): CustomKey =>
	k === "therapy" ||
	k === "multisensory" ||
	k === "neurofeedback" ||
	k === "qeeg" ||
	k === "group" ||
	k === "movement"
		? (`psi:scKind_${k}` as const)
		: "psi:scKind_other";
const audKey = (a: Audience): CustomKey => `psi:scAudience_${a}`;

/** The usual rooms of a clinic like this one: a click fills the form; the team edits the rest. */
const SUGGESTED: ReadonlyArray<{
	name: string;
	kind: string;
	suits: Audience[];
	equipment: string;
	capacity: number;
}> = [
	{
		name: "Camera multisenzorială",
		kind: "multisensory",
		suits: ["child", "teen"],
		equipment: "snoezelen",
		capacity: 3,
	},
	{
		name: "Camera de neurofeedback",
		kind: "neurofeedback",
		suits: ["child", "teen", "adult"],
		equipment: "eeg",
		capacity: 2,
	},
	{
		name: "Camera QEEG",
		kind: "qeeg",
		suits: ["child", "teen", "adult"],
		equipment: "eeg",
		capacity: 2,
	},
	{
		name: "Cabinet de terapie",
		kind: "therapy",
		suits: ["child", "teen", "adult"],
		equipment: "",
		capacity: 3,
	},
];

function Closures({
	room,
	canEdit,
	busy,
	run,
	t,
	today,
}: CardProps & { room: SetupRoom; t: T; today: string }): ReactElement {
	const id = useId();
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [a, setA] = useState("");
	const [b, setB] = useState("");
	const submit = async (e: FormEvent): Promise<void> => {
		e.preventDefault();
		const start = toMinutes(a);
		const end = toMinutes(b);
		const timed = a !== "" || b !== "";
		if (timed && (start === null || end === null)) return;
		const r = await run("room/closure/add", {
			room: room.id,
			from,
			to: timed ? from : to || from,
			...(timed && start !== null && end !== null ? { start, end } : {}),
		});
		if (r.ok) {
			setFrom("");
			setTo("");
			setA("");
			setB("");
		}
	};
	return (
		<div className="psi-closures">
			<h4 className="psi-sub">{t("psi:scClosureTitle")}</h4>
			{room.closures.length === 0 ? <p className="psi-dim">{t("psi:scClosureNone")}</p> : null}
			<ul className="psi-ranges">
				{room.closures.map((c) => (
					<li key={c.id} className="psi-range">
						<span>
							{c.date}
							{c.start === undefined
								? ` · ${t("psi:scAllDay")}`
								: ` · ${hhmm(c.start)}–${hhmm(c.end ?? 0)}`}
						</span>
						{canEdit ? (
							<button
								className="psi-tag__x"
								type="button"
								disabled={busy}
								aria-label={fill(t("psi:scClosureRemove"), { date: c.date })}
								onClick={() => void run("room/closure/remove", { closure: c.id })}
							>
								×
							</button>
						) : null}
					</li>
				))}
			</ul>
			{canEdit ? (
				<form className="psi-inline psi-rangeform" onSubmit={(e) => void submit(e)}>
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
						disabled={a !== "" || b !== ""}
						onChange={(e) => setTo(e.currentTarget.value)}
					/>
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
						disabled={busy || from === ""}
					>
						{t("psi:scClosureAdd")}
					</button>
				</form>
			) : null}
		</div>
	);
}

/** Rooms: named, of a kind, with seats, who they suit and what they hold; taken out of use, never deleted. */
export function RoomsCard({
	rooms,
	today,
	t,
	canEdit,
	busy,
	run,
}: CardProps & { rooms: ReadonlyArray<SetupRoom>; today: string; t: T }): ReactElement {
	const id = useId();
	const [name, setName] = useState("");
	const [kind, setKind] = useState("therapy");
	const [capacity, setCapacity] = useState(2);
	const [suits, setSuits] = useState<Audience[]>(["child", "teen", "adult"]);
	const [equipment, setEquipment] = useState("");
	const [open, setOpen] = useState<string | null>(null);

	const tags = equipment
		.split(",")
		.map((x) => x.trim().toLowerCase())
		.filter((x) => x !== "");
	const add = async (e: FormEvent): Promise<void> => {
		e.preventDefault();
		const r = await run("room/create", { name, kind, capacity, suits, equipment: tags });
		if (r.ok) {
			setName("");
			setEquipment("");
		}
	};

	return (
		<Card id="rooms" icon={<IconRoom />} title={t("psi:scRoomTitle")} hint={t("psi:scRoomHint")}>
			{rooms.length === 0 ? <p className="psi-note">{t("psi:scRoomNone")}</p> : null}
			<ul className="psi-list">
				{rooms.map((r) => (
					<li key={r.id} className="psi-list__item psi-list__item--col">
						<div className="psi-list__top">
							<div className="psi-list__main">
								<strong className={r.active ? "" : "psi-dim"}>{r.name}</strong>
								<span className="psi-pill">{t(kindKey(r.kind))}</span>
								{r.active ? null : <span className="psi-pill">{t("psi:scRoomOff")}</span>}
							</div>
							<Toggle
								label={`${r.name}: ${t("psi:scRoomOnLabel")}`}
								checked={r.active}
								disabled={!canEdit || busy}
								onLabel={t("psi:scOn")}
								offLabel={t("psi:scOff")}
								onChange={(active) => void run("room/update", { room: r.id, patch: { active } })}
							/>
						</div>
						<p className="psi-list__meta">
							{fill(t("psi:scRoomSeats"), { n: r.capacity })} ·{" "}
							{r.suits.map((a) => t(audKey(a))).join(", ")}
							{r.equipment.length === 0 ? "" : ` · ${r.equipment.join(", ")}`}
						</p>
						<button
							className="psi-btn psi-btn--link"
							type="button"
							aria-expanded={open === r.id}
							onClick={() => setOpen(open === r.id ? null : r.id)}
						>
							{t("psi:scClosureTitle")} ({r.closures.length})
						</button>
						{open === r.id ? (
							<Closures room={r} canEdit={canEdit} busy={busy} run={run} t={t} today={today} />
						) : null}
					</li>
				))}
			</ul>
			{canEdit ? (
				<form className="psi-svcform" onSubmit={(e) => void add(e)}>
					<div className="psi-tags__suggest">
						<span className="psi-tags__suggest-label">{t("psi:scRoomSuggest")}</span>
						{SUGGESTED.map((s) => (
							<button
								key={s.name}
								type="button"
								className="psi-chip psi-chip--quiet"
								onClick={() => {
									setName(s.name);
									setKind(s.kind);
									setSuits(s.suits);
									setEquipment(s.equipment);
									setCapacity(s.capacity);
								}}
							>
								{s.name}
							</button>
						))}
					</div>
					<div className="psi-inline">
						<label htmlFor={`${id}-n`}>{t("psi:scRoomName")}</label>
						<input
							id={`${id}-n`}
							type="text"
							value={name}
							maxLength={80}
							required
							onChange={(e) => setName(e.currentTarget.value)}
						/>
						<label htmlFor={`${id}-k`}>{t("psi:scRoomKind")}</label>
						<select id={`${id}-k`} value={kind} onChange={(e) => setKind(e.currentTarget.value)}>
							{ROOM_KINDS.map((k) => (
								<option key={k} value={k}>
									{t(kindKey(k))}
								</option>
							))}
						</select>
						<label htmlFor={`${id}-c`}>{t("psi:scRoomCapacity")}</label>
						<input
							id={`${id}-c`}
							type="number"
							min={1}
							max={50}
							value={capacity}
							onChange={(e) =>
								setCapacity(Math.max(1, Math.min(50, Number(e.currentTarget.value) || 1)))
							}
						/>
					</div>
					<fieldset className="psi-checks">
						<legend className="psi-visually-hidden">{t("psi:scRoomSuits")}</legend>
						<span className="psi-dim">{t("psi:scRoomSuits")}:</span>
						{AUDIENCES.map((a) => (
							<label key={a} className="psi-check">
								<input
									type="checkbox"
									checked={suits.includes(a)}
									onChange={(e) =>
										setSuits(e.currentTarget.checked ? [...suits, a] : suits.filter((x) => x !== a))
									}
								/>
								{t(audKey(a))}
							</label>
						))}
					</fieldset>
					<div className="psi-inline">
						<label htmlFor={`${id}-e`}>{t("psi:scRoomEquip")}</label>
						<input
							id={`${id}-e`}
							type="text"
							value={equipment}
							onChange={(e) => setEquipment(e.currentTarget.value)}
						/>
					</div>
					<p className="psi-sc__hint">{t("psi:scRoomEquipHelp")}</p>
					<div className="psi-inline psi-inline--end">
						<button
							className="psi-btn psi-btn--primary"
							type="submit"
							disabled={busy || name.trim() === "" || suits.length === 0}
						>
							{t("psi:scRoomAdd")}
						</button>
					</div>
				</form>
			) : null}
		</Card>
	);
}
