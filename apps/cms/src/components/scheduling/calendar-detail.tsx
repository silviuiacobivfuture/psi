"use client";
import { DECISION_REASONS } from "@psi/scheduling/domain";
import { type ReactElement, useEffect, useId, useState } from "react";
import type { SetupState } from "../../platform/scheduling-model";
import { type BoardAppointment, type Preview, readPreview } from "./api";
import { dayLabel, wallDate, wallTime } from "./format";
import type { Run, T } from "./types";

/**
 * One request or appointment: who, when, where, and what the team can do with it: confirm,
 * decline or cancel (with an administrative reason, never free text), or move it to another free
 * time of the same practitioner (the times come from the visitors' own search, so a move can only
 * land on a time a visitor could have booked).
 */
export function Detail({
	a,
	setup,
	zone,
	language,
	canEdit,
	busy,
	run,
	onClose,
	t,
}: {
	a: BoardAppointment;
	setup: SetupState;
	zone: string;
	language: string;
	canEdit: boolean;
	busy: boolean;
	run: Run;
	onClose: () => void;
	t: T;
}): ReactElement {
	const id = useId();
	const person = setup.practitioners.find((p) => p.id === a.practitionerId);
	const room = setup.rooms.find((r) => r.id === a.roomId);
	const service = setup.services.find((s) => s.slug === a.serviceSlug);
	const [reason, setReason] = useState<(typeof DECISION_REASONS)[number]>("administrative");
	const [times, setTimes] = useState<Preview["slots"] | null>(null);
	const [move, setMove] = useState("");
	const [moving, setMoving] = useState(false);

	useEffect(() => {
		if (!moving) return;
		let live = true;
		void readPreview(setup.brand, a.serviceSlug).then((r) => {
			if (live)
				setTimes(
					r.ok
						? r.data.slots.filter(
								(s) => s.practitioner === person?.name && s.modes.includes(a.mode),
							)
						: [],
				);
		});
		return () => {
			live = false;
		};
	}, [moving, setup.brand, a.serviceSlug, a.mode, person?.name]);

	const open = a.status === "requested" || a.status === "confirmed";
	const name =
		service === undefined
			? a.serviceSlug
			: ((language === "en" ? service.name?.en : service.name?.ro) ?? service.slug);
	const decide = (decision: "confirm" | "decline" | "cancel"): Promise<unknown> =>
		run("calendar/decide", {
			reference: a.reference,
			decision,
			...(decision === "confirm" ? {} : { reason }),
		});

	return (
		<section className="psi-sc psi-cal__detail" aria-labelledby={`${id}-t`}>
			<header className="psi-sc__head">
				<div className="psi-sc__titles">
					<h2 className="psi-sc__title" id={`${id}-t`}>
						{name} · {wallTime(a.start, zone)}
					</h2>
					<p className="psi-sc__hint">
						<span className={`psi-pill psi-pill--${a.status}`}>
							{t(
								`psi:scSt_${a.status === "held" ? "held" : a.status === "requested" ? "requested" : "confirmed"}`,
							)}
						</span>{" "}
						{dayLabel(wallDate(a.start, zone), language)} · {wallTime(a.start, zone)}–
						{wallTime(a.end, zone)} ·{" "}
						{t(a.mode === "onsite" ? "psi:scModeOnsite" : "psi:scModeOnline")}
					</p>
				</div>
				<button
					className="psi-btn psi-btn--ghost psi-btn--sm"
					type="button"
					onClick={onClose}
					aria-label={t("psi:scCalClose")}
				>
					×
				</button>
			</header>
			<div className="psi-sc__body">
				<p className="psi-list__meta">
					{t("psi:scCalWith")} {person?.name ?? "—"}
					{person?.external ? ` (${t("psi:scPracExternalPill")})` : ""} · {t("psi:scCalRoom")}:{" "}
					{room?.name ?? t("psi:scCalNoRoom")}
					{a.contactName === undefined ? "" : ` · ${a.contactName}`}
				</p>
				{canEdit && open ? (
					<>
						<div className="psi-inline">
							{a.status === "requested" ? (
								<button
									className="psi-btn psi-btn--primary"
									type="button"
									disabled={busy}
									onClick={() => void decide("confirm")}
								>
									{t("psi:scCalConfirm")}
								</button>
							) : null}
							<label htmlFor={`${id}-r`}>{t("psi:scCalReason")}</label>
							<select
								id={`${id}-r`}
								value={reason}
								onChange={(e) =>
									setReason(
										DECISION_REASONS.find((r) => r === e.currentTarget.value) ?? "administrative",
									)
								}
							>
								{DECISION_REASONS.map((r) => (
									<option key={r} value={r}>
										{t(`psi:reason_${r}`)}
									</option>
								))}
							</select>
							{a.status === "requested" ? (
								<button
									className="psi-btn psi-btn--secondary"
									type="button"
									disabled={busy}
									onClick={() => void decide("decline")}
								>
									{t("psi:scCalDecline")}
								</button>
							) : null}
							<button
								className="psi-btn psi-btn--ghost"
								type="button"
								disabled={busy}
								onClick={() => void decide("cancel")}
							>
								{t("psi:scCalCancel")}
							</button>
						</div>
						<div className="psi-inline">
							{moving ? (
								times === null ? (
									<span className="psi-dim">{t("psi:scPrevLoading")}</span>
								) : times.length === 0 ? (
									<span className="psi-dim">{t("psi:scCalMoveNone")}</span>
								) : (
									<>
										<label htmlFor={`${id}-m`}>{t("psi:scCalMove")}</label>
										<select
											id={`${id}-m`}
											value={move}
											onChange={(e) => setMove(e.currentTarget.value)}
										>
											<option value="" />
											{times.slice(0, 40).map((s) => (
												<option key={s.start} value={String(s.start)}>
													{dayLabel(wallDate(s.start, zone), language)} {wallTime(s.start, zone)}
												</option>
											))}
										</select>
										<button
											className="psi-btn psi-btn--primary psi-btn--sm"
											type="button"
											disabled={busy || move === ""}
											onClick={() =>
												void run("calendar/reschedule", {
													reference: a.reference,
													start: Number(move),
													mode: a.mode,
												}).then(onClose)
											}
										>
											{t("psi:scCalMoveGo")}
										</button>
									</>
								)
							) : (
								<button
									className="psi-btn psi-btn--link"
									type="button"
									onClick={() => setMoving(true)}
								>
									{t("psi:scCalMove")}
								</button>
							)}
						</div>
					</>
				) : null}
			</div>
		</section>
	);
}
