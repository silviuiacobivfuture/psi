"use client";
import { type ReactElement, useState } from "react";
import type { SetupPractitioner, SetupService } from "../../platform/scheduling-model";
import { Card, Toggle } from "../studio/controls";
import { IconService } from "./icons";
import { draftOf, type ServiceDraft, ServiceForm } from "./service-form";
import type { CardProps, T } from "./types";

const STARTER_SLUG = "evaluation";

/** The starter: the one service the site's chat offers today, with sensible settings. */
function starterOf(slug: string, people: ReadonlyArray<SetupPractitioner>): ServiceDraft {
	return {
		slug,
		nameRo: "Evaluare inițială",
		nameEn: "Initial assessment",
		durationMinutes: 60,
		bufferMinutes: 10,
		stepMinutes: 30,
		noticeHours: 24,
		horizonDays: 60,
		modes: ["onsite", "online"],
		practitioners: people.filter((p) => p.active).map((p) => p.id),
		roomKind: null,
	};
}

const BLANK: ServiceDraft = {
	slug: "",
	nameRo: "",
	nameEn: "",
	durationMinutes: 60,
	bufferMinutes: 10,
	stepMinutes: 30,
	noticeHours: 24,
	horizonDays: 60,
	modes: ["onsite", "online"],
	practitioners: [],
	roomKind: null,
};

type Editing = { kind: "new"; draft: ServiceDraft } | { kind: "edit"; slug: string } | null;

/** Services: what can be booked. Add, edit, and take offline; the key (slug) never changes. */
export function ServicesCard({
	services,
	people,
	language,
	t,
	canEdit,
	busy,
	run,
}: CardProps & {
	services: ReadonlyArray<SetupService>;
	people: ReadonlyArray<SetupPractitioner>;
	language: string;
	t: T;
}): ReactElement {
	const [editing, setEditing] = useState<Editing>(null);
	const starter = services.some((s) => s.slug === STARTER_SLUG) ? undefined : STARTER_SLUG;
	const nameOf = (s: SetupService): string =>
		(language === "en" ? s.name?.en : s.name?.ro) ?? s.slug;
	const who = (s: SetupService): string =>
		people
			.filter((p) => s.practitioners.includes(p.id))
			.map((p) => p.name)
			.join(", ");
	const modes = (s: SetupService): string =>
		s.modes.map((m) => (m === "onsite" ? t("psi:scModeOnsite") : t("psi:scModeOnline"))).join(", ");

	return (
		<Card
			id="services"
			icon={<IconService />}
			title={t("psi:scSvcTitle")}
			hint={t("psi:scSvcHint")}
		>
			{services.length === 0 && editing === null ? (
				<p className="psi-note">{t("psi:scSvcNone")}</p>
			) : null}
			<ul className="psi-list">
				{services.map((s) => (
					<li key={s.id} className="psi-list__item psi-list__item--col">
						<div className="psi-list__top">
							<div className="psi-list__main">
								<strong className={s.active ? "" : "psi-dim"}>{nameOf(s)}</strong>
								<code className="psi-code">{s.slug}</code>
							</div>
							<Toggle
								label={`${nameOf(s)}: ${t("psi:scSvcOnline")}`}
								checked={s.active}
								disabled={!canEdit || busy}
								onLabel={t("psi:scOn")}
								offLabel={t("psi:scOff")}
								onChange={(active) =>
									void run("service/update", { service: s.slug, patch: { active } })
								}
							/>
						</div>
						<p className="psi-list__meta">
							{s.durationMinutes} {t("psi:scMin")} · {modes(s)} ·{" "}
							{who(s) === "" ? t("psi:scSvcNoWho") : who(s)}
						</p>
						{canEdit && editing?.kind !== "edit" ? (
							<button
								className="psi-btn psi-btn--link"
								type="button"
								onClick={() => setEditing({ kind: "edit", slug: s.slug })}
							>
								{t("psi:scEdit")}
							</button>
						) : null}
						{editing?.kind === "edit" && editing.slug === s.slug ? (
							<ServiceForm
								initial={draftOf(s)}
								creating={false}
								people={people}
								t={t}
								busy={busy}
								run={run}
								onDone={() => setEditing(null)}
							/>
						) : null}
					</li>
				))}
			</ul>
			{editing?.kind === "new" ? (
				<ServiceForm
					initial={editing.draft}
					creating
					people={people}
					t={t}
					busy={busy}
					run={run}
					onDone={() => setEditing(null)}
				/>
			) : null}
			{canEdit && editing === null ? (
				<div className="psi-inline">
					{starter === undefined ? null : (
						<button
							className="psi-btn psi-btn--primary"
							type="button"
							onClick={() => setEditing({ kind: "new", draft: starterOf(starter, people) })}
						>
							{t("psi:scSvcStarter")}
						</button>
					)}
					<button
						className={
							starter === undefined ? "psi-btn psi-btn--primary" : "psi-btn psi-btn--secondary"
						}
						type="button"
						onClick={() => setEditing({ kind: "new", draft: BLANK })}
					>
						{t("psi:scSvcAdd")}
					</button>
				</div>
			) : null}
		</Card>
	);
}
