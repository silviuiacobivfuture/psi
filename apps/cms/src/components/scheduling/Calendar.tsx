"use client";
import { useTranslation } from "@payloadcms/ui";
import {
	type FormEvent,
	type ReactElement,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useState,
} from "react";
import type { CustomKey } from "../../i18n";
import type { SetupState } from "../../platform/scheduling-model";
import { act, type Board, type BoardAppointment, readBoard, readSetup } from "./api";
import { Detail } from "./calendar-detail";
import { addDay, axisOf, mondayOf, place } from "./calendar-layout";
import { Agenda, QuickAdd } from "./calendar-parts";
import { dayLabel, hhmm, toMinutes, wallDate, wallTime } from "./format";
import { errorKey, type Run, type T } from "./types";

type View = "week" | "day";
type By = "people" | "rooms";
type Flash = { tone: "ok" | "bad"; text: string } | null;

interface Ev {
	id: string;
	start: number;
	end: number;
	kind: "appointment" | "closure";
	label: string;
	status?: BoardAppointment["status"];
	appointment?: BoardAppointment;
}

const PX = 0.9;

/** Start and end minutes of an appointment on a given local date, clipped to the day. */
function minutesOn(instant: number, zone: string): number {
	return toMinutes(wallTime(instant, zone)) ?? 0;
}

/**
 * The staff calendar: a week or a day, by practitioner or by room. Requests, confirmed visits and
 * live holds are blocks coloured by state (and labelled, never colour alone); working hours are the
 * real ones (periods, alternating weeks and days off already applied); rooms show their closures.
 * A block opens its details with the actions. Below 700px the grid becomes an agenda list.
 */
export function Calendar({
	initial,
	canEdit,
}: {
	initial: SetupState;
	canEdit: boolean;
}): ReactElement {
	const { t: raw, i18n } = useTranslation<object, CustomKey>();
	const t: T = useCallback((k) => raw(k), [raw]);
	const language = i18n.language === "en" ? "en" : "ro";
	const [setup, setSetup] = useState(initial);
	const [view, setView] = useState<View>("week");
	const [by, setBy] = useState<By>("people");
	const [date, setDate] = useState(initial.today);
	const [pick, setPick] = useState("all");
	const [board, setBoard] = useState<Board | null>(null);
	const [failed, setFailed] = useState(false);
	const [selected, setSelected] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [flash, setFlash] = useState<Flash>(null);
	const [tick, setTick] = useState(0);
	const id = useId();

	const from = view === "week" ? mondayOf(date) : date;
	const days = view === "week" ? 7 : 1;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `tick` re-reads after a change
	useEffect(() => {
		let live = true;
		setFailed(false);
		void readBoard(initial.brand, from, days).then((r) => {
			if (!live) return;
			if (r.ok) setBoard(r.data);
			else setFailed(true);
		});
		return () => {
			live = false;
		};
	}, [initial.brand, from, days, tick]);

	const run: Run = useCallback(
		async (path, body, done) => {
			setBusy(true);
			setFlash(null);
			const r = await act(path, { brand: initial.brand, ...body });
			if (!r.ok) setFlash({ tone: "bad", text: t(errorKey(r.error)) });
			else {
				const fresh = await readSetup(initial.brand);
				if (fresh.ok) setSetup(fresh.data.setup);
				setTick((n) => n + 1);
				setSelected(null);
				setFlash({ tone: "ok", text: done?.(r.data) ?? t("psi:scCalDone") });
			}
			setBusy(false);
			return r;
		},
		[initial.brand, t],
	);

	const zone = board?.timeZone ?? setup.timeZone;
	const resources = useMemo(
		() =>
			by === "people"
				? setup.practitioners.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))
				: setup.rooms.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name })),
		[by, setup],
	);
	const nameOf = (slug: string): string => {
		const s = setup.services.find((x) => x.slug === slug);
		return (language === "en" ? s?.name?.en : s?.name?.ro) ?? slug;
	};

	/** Columns: days (of the chosen resource, or all) in a week; resources in a day. */
	const columns = useMemo(() => {
		if (view === "week")
			return Array.from({ length: 7 }, (_, i) => ({
				key: addDay(from, i),
				date: addDay(from, i),
				resource: pick,
			}));
		return resources.map((r) => ({ key: r.id, date: from, resource: r.id }));
	}, [view, from, pick, resources]);

	const eventsFor = (col: { date: string; resource: string }): Ev[] => {
		if (board === null) return [];
		const out: Ev[] = [];
		for (const a of board.appointments) {
			if (wallDate(a.start, zone) !== col.date) continue;
			const match =
				by === "people"
					? col.resource === "all" || a.practitionerId === col.resource
					: a.roomId !== undefined && (col.resource === "all" || a.roomId === col.resource);
			if (!match) continue;
			out.push({
				id: a.reference,
				start: minutesOn(a.start, zone),
				end: Math.max(minutesOn(a.start, zone) + 15, minutesOn(a.end, zone) || 24 * 60),
				kind: "appointment",
				label: `${wallTime(a.start, zone)} ${nameOf(a.serviceSlug)}${a.contactName === undefined ? "" : ` · ${a.contactName}`}`,
				status: a.status,
				appointment: a,
			});
		}
		if (by === "rooms") {
			for (const c of board.closures) {
				if (c.date !== col.date || !(col.resource === "all" || c.roomId === col.resource)) continue;
				out.push({
					id: c.id,
					start: c.start ?? 0,
					end: c.end ?? 24 * 60,
					kind: "closure",
					label: t("psi:scCalClosed"),
				});
			}
		}
		return out;
	};
	const hoursFor = (col: { date: string; resource: string }): Board["hours"] =>
		by === "people" && board !== null
			? board.hours.filter(
					(h) =>
						h.date === col.date && (col.resource === "all" || h.practitionerId === col.resource),
				)
			: [];
	const offFor = (col: { date: string; resource: string }): boolean =>
		by === "people" &&
		board !== null &&
		col.resource !== "all" &&
		board.off.some((o) => o.date === col.date && o.practitionerId === col.resource);

	const all = columns.flatMap((c) => [...eventsFor(c), ...hoursFor(c)]);
	const axis = axisOf(all);
	const height = (axis.to - axis.from) * PX;
	const hoursMarks = Array.from(
		{ length: (axis.to - axis.from) / 60 + 1 },
		(_, i) => axis.from + i * 60,
	);
	const sel: BoardAppointment | undefined = board?.appointments.find(
		(a) => a.reference === selected,
	);
	const nothing = board !== null && board.appointments.length === 0 && board.closures.length === 0;

	const step = (n: number): void => setDate(addDay(date, n * (view === "week" ? 7 : 1)));

	return (
		<div className="psi-studio-wrap psi-sched psi-cal">
			<div className="psi-cal__bar">
				<div className="psi-inline">
					<button
						className="psi-btn psi-btn--ghost psi-btn--sm"
						type="button"
						onClick={() => step(-1)}
						aria-label={t("psi:scCalPrev")}
					>
						‹
					</button>
					<button
						className="psi-btn psi-btn--secondary psi-btn--sm"
						type="button"
						onClick={() => setDate(setup.today)}
					>
						{t("psi:scCalToday")}
					</button>
					<button
						className="psi-btn psi-btn--ghost psi-btn--sm"
						type="button"
						onClick={() => step(1)}
						aria-label={t("psi:scCalNext")}
					>
						›
					</button>
					<strong className="psi-cal__range">
						{view === "week"
							? `${dayLabel(from, language)} – ${dayLabel(addDay(from, 6), language)}`
							: dayLabel(from, language)}
					</strong>
				</div>
				<div className="psi-inline">
					<fieldset className="psi-seg psi-seg--sm">
						<legend className="psi-visually-hidden">{t("psi:scCalWeek")}</legend>
						{(["week", "day"] as const).map((v) => (
							<label key={v} className="psi-seg__opt">
								<input
									type="radio"
									name={`${id}-v`}
									checked={view === v}
									onChange={() => setView(v)}
								/>
								<span className="psi-seg__label">
									{v === "week" ? t("psi:scCalWeek") : t("psi:scCalDay")}
								</span>
							</label>
						))}
					</fieldset>
					<fieldset className="psi-seg psi-seg--sm">
						<legend className="psi-visually-hidden">{t("psi:scCalByPeople")}</legend>
						{(["people", "rooms"] as const).map((v) => (
							<label key={v} className="psi-seg__opt">
								<input
									type="radio"
									name={`${id}-b`}
									checked={by === v}
									onChange={() => {
										setBy(v);
										setPick("all");
									}}
								/>
								<span className="psi-seg__label">
									{v === "people" ? t("psi:scCalByPeople") : t("psi:scCalByRooms")}
								</span>
							</label>
						))}
					</fieldset>
					{view === "week" ? (
						<>
							<label htmlFor={`${id}-p`}>{t("psi:scCalShow")}</label>
							<select id={`${id}-p`} value={pick} onChange={(e) => setPick(e.currentTarget.value)}>
								<option value="all">{t("psi:scCalAll")}</option>
								{resources.map((r) => (
									<option key={r.id} value={r.id}>
										{r.name}
									</option>
								))}
							</select>
						</>
					) : null}
				</div>
			</div>
			<ul className="psi-legend" aria-hidden="true">
				<li className="psi-legend__i psi-legend__i--requested">{t("psi:scSt_requested")}</li>
				<li className="psi-legend__i psi-legend__i--confirmed">{t("psi:scSt_confirmed")}</li>
				<li className="psi-legend__i psi-legend__i--held">{t("psi:scSt_held")}</li>
				<li className="psi-legend__i psi-legend__i--closure">{t("psi:scCalClosed")}</li>
			</ul>
			{sel === undefined ? null : (
				<Detail
					a={sel}
					setup={setup}
					zone={zone}
					language={language}
					canEdit={canEdit}
					busy={busy}
					run={run}
					onClose={() => setSelected(null)}
					t={t}
				/>
			)}
			{failed ? <p className="psi-note psi-note--warn">{t("psi:scErr_unreachable2")}</p> : null}
			{board === null && !failed ? <p className="psi-dim">{t("psi:scCalLoading")}</p> : null}
			{board !== null ? (
				<>
					<div className="psi-cal__grid" style={{ ["--cols" as string]: columns.length }}>
						<div className="psi-cal__corner" />
						{columns.map((c) => (
							<div
								key={c.key}
								className={
									c.date === board.today && view === "week"
										? "psi-cal__head psi-cal__head--today"
										: "psi-cal__head"
								}
							>
								{view === "week"
									? dayLabel(c.date, language)
									: (resources.find((r) => r.id === c.resource)?.name ?? "")}
								{offFor(c) ? <span className="psi-dim"> · {t("psi:scCalOffDay")}</span> : null}
							</div>
						))}
						<div className="psi-cal__axis" style={{ height }}>
							{hoursMarks.map((m) => (
								<span key={m} className="psi-cal__tick" style={{ top: (m - axis.from) * PX }}>
									{hhmm(m % 1440)}
								</span>
							))}
						</div>
						{columns.map((c) => {
							const placed = place(eventsFor(c));
							const evs = eventsFor(c);
							return (
								<div
									key={c.key}
									className={offFor(c) ? "psi-cal__col psi-cal__col--off" : "psi-cal__col"}
									style={{ height }}
								>
									{hoursFor(c).map((h) => (
										<div
											key={`${h.practitionerId}-${h.start}-${h.end}`}
											className="psi-cal__hours"
											style={{ top: (h.start - axis.from) * PX, height: (h.end - h.start) * PX }}
										/>
									))}
									{placed.map((p) => {
										const e = evs.find((x) => x.id === p.id);
										if (e === undefined) return null;
										const style = {
											top: (e.start - axis.from) * PX,
											height: Math.max(18, (e.end - e.start) * PX - 2),
											left: `${(p.lane / p.lanes) * 100}%`,
											width: `calc(${100 / p.lanes}% - 2px)`,
										};
										return e.kind === "closure" ? (
											<div key={e.id} className="psi-ev psi-ev--closure" style={style}>
												{e.label}
											</div>
										) : (
											<button
												key={e.id}
												type="button"
												className={`psi-ev psi-ev--${e.status ?? "confirmed"}${selected === e.id ? " psi-ev--on" : ""}`}
												style={style}
												aria-label={`${e.label} (${t(`psi:scSt_${e.status === "held" ? "held" : e.status === "requested" ? "requested" : "confirmed"}`)})`}
												onClick={() => setSelected(e.id)}
											>
												{e.label}
											</button>
										);
									})}
								</div>
							);
						})}
					</div>
					<Agenda
						board={board}
						zone={zone}
						language={language}
						by={by}
						setup={setup}
						nameOf={nameOf}
						onPick={setSelected}
						t={t}
					/>
					{nothing ? <p className="psi-dim">{t("psi:scCalEmpty")}</p> : null}
				</>
			) : null}
			{canEdit ? <QuickAdd setup={setup} busy={busy} run={run} t={t} /> : null}
			<div className="psi-sched__flash" role="status" aria-live="polite">
				{flash === null ? null : (
					<span
						className={flash.tone === "ok" ? "psi-flash psi-flash--ok" : "psi-flash psi-flash--bad"}
					>
						{flash.text}
					</span>
				)}
			</div>
		</div>
	);
}
