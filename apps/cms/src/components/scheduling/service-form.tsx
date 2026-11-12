"use client";
import { ROOM_KINDS } from "@psi/scheduling/domain";
import { type FormEvent, type ReactElement, useState } from "react";
import {
	type SetupMode,
	type SetupPractitioner,
	type SetupService,
	slugify,
} from "../../platform/scheduling-model";
import { Row, Segmented, Stepper } from "../studio/controls";
import type { CardProps, T } from "./types";

/** What the form edits; `noticeHours` is the minimum notice in hours (the store keeps minutes). */
export interface ServiceDraft {
	slug: string;
	nameRo: string;
	nameEn: string;
	durationMinutes: number;
	bufferMinutes: number;
	stepMinutes: 15 | 30 | 60;
	noticeHours: number;
	horizonDays: number;
	modes: SetupMode[];
	practitioners: string[];
	/** An onsite session needs a room of this kind; null: none. */
	roomKind: string | null;
}

const STEPS = ["15", "30", "60"] as const;
const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;

export function draftOf(s: SetupService): ServiceDraft {
	return {
		slug: s.slug,
		nameRo: s.name?.ro ?? s.slug,
		nameEn: s.name?.en ?? s.slug,
		durationMinutes: s.durationMinutes,
		bufferMinutes: s.bufferMinutes,
		stepMinutes: s.stepMinutes === 15 || s.stepMinutes === 60 ? s.stepMinutes : 30,
		noticeHours: Math.round(s.minNoticeMinutes / 60),
		horizonDays: s.horizonDays,
		modes: s.modes,
		practitioners: s.practitioners,
		roomKind: s.roomKind,
	};
}

function toggled<V>(list: ReadonlyArray<V>, value: V, on: boolean): V[] {
	return on ? [...list.filter((v) => v !== value), value] : list.filter((v) => v !== value);
}

/** The create/edit form of one service. A new one picks its key (immutable); an old one cannot. */
export function ServiceForm({
	initial,
	creating,
	people,
	t,
	busy,
	run,
	onDone,
}: Pick<CardProps, "busy" | "run"> & {
	initial: ServiceDraft;
	creating: boolean;
	people: ReadonlyArray<SetupPractitioner>;
	t: T;
	onDone: () => void;
}): ReactElement {
	const [d, setD] = useState(initial);
	const [slugTouched, setSlugTouched] = useState(!creating || initial.slug !== "");
	const set = (patch: Partial<ServiceDraft>): void => setD((x) => ({ ...x, ...patch }));
	const valid =
		SLUG.test(d.slug) && d.nameRo.trim() !== "" && d.nameEn.trim() !== "" && d.modes.length > 0;

	const body = {
		nameRo: d.nameRo.trim(),
		nameEn: d.nameEn.trim(),
		durationMinutes: d.durationMinutes,
		bufferMinutes: d.bufferMinutes,
		stepMinutes: d.stepMinutes,
		minNoticeMinutes: d.noticeHours * 60,
		horizonDays: d.horizonDays,
		modes: d.modes,
		practitioners: d.practitioners,
		roomKind: d.roomKind,
		roomEquipment: [],
		roomAudiences: [],
	};
	const submit = async (e: FormEvent): Promise<void> => {
		e.preventDefault();
		const r = creating
			? await run("service/create", { slug: d.slug, ...body })
			: await run("service/update", { service: d.slug, patch: body });
		if (r.ok) onDone();
	};
	const id = (k: string): string => `svc-${d.slug || "new"}-${k}`;

	return (
		<form className="psi-svcform" onSubmit={(e) => void submit(e)}>
			<Row label={t("psi:scSvcNameRo")} labelFor={id("ro")}>
				<input
					id={id("ro")}
					type="text"
					value={d.nameRo}
					maxLength={80}
					required
					onChange={(e) => {
						const nameRo = e.currentTarget.value;
						set({ nameRo, ...(slugTouched ? {} : { slug: slugify(nameRo) }) });
					}}
				/>
			</Row>
			<Row label={t("psi:scSvcNameEn")} labelFor={id("en")}>
				<input
					id={id("en")}
					type="text"
					value={d.nameEn}
					maxLength={80}
					required
					onChange={(e) => set({ nameEn: e.currentTarget.value })}
				/>
			</Row>
			<Row
				label={t("psi:scSvcSlug")}
				help={creating ? t("psi:scSvcSlugHelp") : undefined}
				labelFor={id("slug")}
			>
				<input
					id={id("slug")}
					type="text"
					value={d.slug}
					readOnly={!creating}
					pattern="[a-z0-9][a-z0-9\-]{1,40}"
					required
					onChange={(e) => {
						setSlugTouched(true);
						set({ slug: e.currentTarget.value });
					}}
				/>
			</Row>
			<Row label={t("psi:scSvcDuration")} labelFor={id("dur")}>
				<Stepper
					id={id("dur")}
					value={d.durationMinutes}
					min={5}
					max={480}
					unit={t("psi:scMin")}
					less="−"
					more="+"
					onChange={(v) => set({ durationMinutes: v })}
				/>
			</Row>
			<Row label={t("psi:scSvcBuffer")} labelFor={id("buf")}>
				<Stepper
					id={id("buf")}
					value={d.bufferMinutes}
					min={0}
					max={240}
					unit={t("psi:scMin")}
					less="−"
					more="+"
					onChange={(v) => set({ bufferMinutes: v })}
				/>
			</Row>
			<Row label={t("psi:scSvcStep")}>
				<Segmented
					name="step"
					label={t("psi:scSvcStep")}
					size="sm"
					value={d.stepMinutes === 15 ? "15" : d.stepMinutes === 60 ? "60" : "30"}
					options={STEPS.map((s) => ({ value: s, label: `${s} ${t("psi:scMin")}` }))}
					onChange={(v) => set({ stepMinutes: v === "15" ? 15 : v === "60" ? 60 : 30 })}
				/>
			</Row>
			<Row label={t("psi:scSvcNotice")} labelFor={id("not")}>
				<Stepper
					id={id("not")}
					value={d.noticeHours}
					min={0}
					max={720}
					unit={t("psi:scNoticeHours")}
					less="−"
					more="+"
					onChange={(v) => set({ noticeHours: v })}
				/>
			</Row>
			<Row label={t("psi:scSvcHorizon")} labelFor={id("hor")}>
				<Stepper
					id={id("hor")}
					value={d.horizonDays}
					min={1}
					max={180}
					unit={t("psi:scDays")}
					less="−"
					more="+"
					onChange={(v) => set({ horizonDays: v })}
				/>
			</Row>
			<Row label={t("psi:scSvcModes")}>
				<fieldset className="psi-checks">
					<legend className="psi-visually-hidden">{t("psi:scSvcModes")}</legend>
					{(["onsite", "online"] as const).map((m) => (
						<label key={m} className="psi-check">
							<input
								type="checkbox"
								checked={d.modes.includes(m)}
								onChange={(e) => set({ modes: toggled(d.modes, m, e.currentTarget.checked) })}
							/>
							{m === "onsite" ? t("psi:scModeOnsite") : t("psi:scModeOnline")}
						</label>
					))}
				</fieldset>
			</Row>
			<Row label={t("psi:scSvcRoom")} labelFor={id("room")}>
				<select
					id={id("room")}
					value={d.roomKind ?? ""}
					onChange={(e) =>
						set({ roomKind: e.currentTarget.value === "" ? null : e.currentTarget.value })
					}
				>
					<option value="">{t("psi:scSvcRoomNone")}</option>
					{ROOM_KINDS.map((k) => (
						<option key={k} value={k}>
							{t(`psi:scKind_${k}`)}
						</option>
					))}
				</select>
			</Row>
			<Row label={t("psi:scSvcWho")}>
				{people.length === 0 ? (
					<span className="psi-dim">{t("psi:scSvcWhoNone")}</span>
				) : (
					<fieldset className="psi-checks">
						<legend className="psi-visually-hidden">{t("psi:scSvcWho")}</legend>
						{people.map((p) => (
							<label key={p.id} className="psi-check">
								<input
									type="checkbox"
									checked={d.practitioners.includes(p.id)}
									onChange={(e) =>
										set({ practitioners: toggled(d.practitioners, p.id, e.currentTarget.checked) })
									}
								/>
								{p.name}
							</label>
						))}
					</fieldset>
				)}
			</Row>
			<div className="psi-inline psi-inline--end">
				<button className="psi-btn psi-btn--ghost" type="button" onClick={onDone}>
					{t("psi:scCancel")}
				</button>
				<button className="psi-btn psi-btn--primary" type="submit" disabled={busy || !valid}>
					{t("psi:scSave")}
				</button>
			</div>
		</form>
	);
}
