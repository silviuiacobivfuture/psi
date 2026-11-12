"use client";
import { type FormEvent, type ReactElement, useState } from "react";
import type { SetupPractitioner, SetupRoom } from "../../platform/scheduling-model";
import { Card, Toggle } from "../studio/controls";
import { IconPerson } from "./icons";
import { type CardProps, fill, type T } from "./types";

/** Practitioners: add, rename, and take offline (never delete: past visits point to them). */
export function PractitionersCard({
	people,
	rooms,
	t,
	canEdit,
	busy,
	run,
}: CardProps & {
	people: ReadonlyArray<SetupPractitioner>;
	rooms: ReadonlyArray<SetupRoom>;
	t: T;
}): ReactElement {
	const [name, setName] = useState("");
	const [external, setExternal] = useState(false);
	const [renaming, setRenaming] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [upcoming, setUpcoming] = useState<Readonly<Record<string, number>>>({});

	const add = async (e: FormEvent): Promise<void> => {
		e.preventDefault();
		const r = await run("practitioner/create", { name, external });
		if (r.ok) {
			setName("");
			setExternal(false);
		}
	};
	const rename = async (e: FormEvent, id: string): Promise<void> => {
		e.preventDefault();
		const r = await run("practitioner/update", { practitioner: id, name: draft });
		if (r.ok) setRenaming(null);
	};
	const toggle = async (p: SetupPractitioner, active: boolean): Promise<void> => {
		const r = await run("practitioner/update", { practitioner: p.id, active });
		const n = r.ok && typeof r.data.upcoming === "number" ? r.data.upcoming : 0;
		setUpcoming((u) => ({ ...u, [p.id]: active ? 0 : n }));
	};

	return (
		<Card
			id="practitioners"
			icon={<IconPerson />}
			title={t("psi:scPracTitle")}
			hint={t("psi:scPracHint")}
		>
			{people.length === 0 ? <p className="psi-note">{t("psi:scPracNone")}</p> : null}
			<ul className="psi-list">
				{people.map((p) => (
					<li key={p.id} className="psi-list__item">
						{renaming === p.id ? (
							<form className="psi-inline" onSubmit={(e) => void rename(e, p.id)}>
								<label className="psi-visually-hidden" htmlFor={`rn-${p.id}`}>
									{t("psi:scPracName")}
								</label>
								<input
									id={`rn-${p.id}`}
									type="text"
									value={draft}
									maxLength={80}
									required
									onChange={(e) => setDraft(e.currentTarget.value)}
								/>
								<button
									className="psi-btn psi-btn--primary psi-btn--sm"
									type="submit"
									disabled={busy}
								>
									{t("psi:scSave")}
								</button>
								<button
									className="psi-btn psi-btn--ghost psi-btn--sm"
									type="button"
									onClick={() => setRenaming(null)}
								>
									{t("psi:scCancel")}
								</button>
							</form>
						) : (
							<>
								<div className="psi-list__main">
									<strong className={p.active ? "" : "psi-dim"}>{p.name}</strong>
									{p.active ? null : <span className="psi-pill">{t("psi:scPracInactive")}</span>}
									{p.external ? (
										<span className="psi-pill">{t("psi:scPracExternalPill")}</span>
									) : null}
									{canEdit ? (
										<button
											className="psi-btn psi-btn--link"
											type="button"
											onClick={() => {
												setRenaming(p.id);
												setDraft(p.name);
											}}
										>
											{t("psi:scPracRename")}
										</button>
									) : null}
								</div>
								<Toggle
									label={`${p.name}: ${t("psi:scPracActive")}`}
									checked={p.active}
									disabled={!canEdit || busy}
									onLabel={t("psi:scOn")}
									offLabel={t("psi:scOff")}
									onChange={(v) => void toggle(p, v)}
								/>
							</>
						)}
						{canEdit && renaming !== p.id ? (
							<details className="psi-list__note psi-more">
								<summary>{t("psi:scPracSettings")}</summary>
								<label className="psi-check">
									<input
										type="checkbox"
										checked={p.external}
										disabled={busy}
										onChange={(e) =>
											void run("practitioner/update", {
												practitioner: p.id,
												external: e.currentTarget.checked,
											})
										}
									/>
									{t("psi:scPracExternal")}
								</label>
								<p className="psi-sc__hint">{t("psi:scPracExternalHelp")}</p>
								{rooms.length === 0 ? null : (
									<fieldset className="psi-checks">
										<legend className="psi-sub">{t("psi:scPracRooms")}</legend>
										{rooms.map((r) => (
											<label key={r.id} className="psi-check">
												<input
													type="checkbox"
													checked={p.rooms.includes(r.id)}
													disabled={busy}
													onChange={(e) =>
														void run("practitioner/update", {
															practitioner: p.id,
															rooms: e.currentTarget.checked
																? [...p.rooms, r.id]
																: p.rooms.filter((x) => x !== r.id),
														})
													}
												/>
												{r.name}
											</label>
										))}
										<span className="psi-sc__hint">{t("psi:scPracRoomsAny")}</span>
									</fieldset>
								)}
							</details>
						) : null}
						{!p.active && (upcoming[p.id] ?? 0) > 0 ? (
							<p className="psi-note psi-note--warn psi-list__note" role="status">
								{fill(t("psi:scPracOffWarn"), { n: upcoming[p.id] ?? 0 })}
							</p>
						) : null}
					</li>
				))}
			</ul>
			{canEdit ? (
				<form className="psi-inline" onSubmit={(e) => void add(e)}>
					<label className="psi-visually-hidden" htmlFor="prac-new">
						{t("psi:scPracName")}
					</label>
					<input
						id="prac-new"
						type="text"
						value={name}
						maxLength={80}
						required
						placeholder={t("psi:scPracNamePlaceholder")}
						onChange={(e) => setName(e.currentTarget.value)}
					/>
					<button
						className="psi-btn psi-btn--primary"
						type="submit"
						disabled={busy || name.trim() === ""}
					>
						{t("psi:scPracAdd")}
					</button>
				</form>
			) : null}
		</Card>
	);
}
