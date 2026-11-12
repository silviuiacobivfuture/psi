"use client";
import { useTranslation } from "@payloadcms/ui";
import { type ReactElement, useCallback, useState } from "react";
import type { CustomKey } from "../../i18n";
import { isReady, type SetupState } from "../../platform/scheduling-model";
import { act, type Reply, readSetup } from "./api";
import { DaysOffCard } from "./daysoff-card";
import { HoursCard } from "./hours-card";
import { PractitionersCard } from "./practitioners-card";
import { PreviewCard } from "./preview-card";
import { RoomsCard } from "./rooms-card";
import { ServicesCard } from "./services-card";
import { errorKey, type Run, type T } from "./types";

type Flash = { tone: "ok" | "bad"; text: string } | null;

/** What is done and what is left, in the order the team does it. */
function Steps({ setup, t }: { setup: SetupState; t: T }): ReactElement {
	const hours = setup.practitioners.some((p) => (p.rules ?? []).some((r) => !r.dated));
	const steps: ReadonlyArray<{ done: boolean; text: string; href: string }> = [
		{ done: setup.practitioners.length > 0, text: t("psi:scStep1"), href: "#practitioners" },
		{ done: setup.services.length > 0, text: t("psi:scStep2"), href: "#services" },
		{ done: hours, text: t("psi:scStep3"), href: "#hours" },
	];
	return (
		<ol className="psi-steps" aria-label={t("psi:scStepsLabel")}>
			{steps.map((s, i) => (
				<li key={s.href} className={s.done ? "psi-step psi-step--done" : "psi-step"}>
					<span className="psi-step__n" aria-hidden="true">
						{s.done ? "✓" : i + 1}
					</span>
					<a href={s.href}>{s.text}</a>
					<span className="psi-visually-hidden">
						{s.done ? t("psi:scStepDone") : t("psi:scStepTodo")}
					</span>
				</li>
			))}
		</ol>
	);
}

/**
 * The Scheduling setup for one brand: practitioners, services, the weekly hours, days off, and on
 * the right what visitors will be offered. Every change goes to the server (which asks the estate
 * again whether the person is a calendar manager), then the whole setup is read back, so the page
 * always shows what the store holds. Without `calendar_manager` every control is read-only.
 */
export function SchedulingStudio({
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
	const [busy, setBusy] = useState(false);
	const [flash, setFlash] = useState<Flash>(null);
	const [version, setVersion] = useState(0);

	const run: Run = useCallback(
		async (path, body, done) => {
			setBusy(true);
			setFlash(null);
			const r: Reply<Record<string, unknown>> = await act(path, { brand: initial.brand, ...body });
			if (!r.ok) {
				setFlash({ tone: "bad", text: t(errorKey(r.error)) });
				setBusy(false);
				return r;
			}
			const fresh = await readSetup(initial.brand);
			if (fresh.ok) setSetup(fresh.data.setup);
			setVersion((n) => n + 1);
			setFlash({
				tone: fresh.ok ? "ok" : "bad",
				text: fresh.ok ? (done?.(r.data) ?? t("psi:scNoteSaved")) : t("psi:scErr_unreachable"),
			});
			setBusy(false);
			return r;
		},
		[initial.brand, t],
	);

	const common = { canEdit, busy, run };
	return (
		<div className="psi-studio-wrap psi-sched">
			{isReady(setup) ? (
				<div className="psi-note psi-note--ok">
					<strong>{t("psi:scReadyTitle")}</strong> {t("psi:scReadyHint")}
				</div>
			) : (
				<div className="psi-note psi-note--lock">
					<p className="psi-sched__empty">{t("psi:scEmpty")}</p>
					<Steps setup={setup} t={t} />
				</div>
			)}
			{canEdit ? null : <p className="psi-note">{t("psi:scReadOnly")}</p>}
			<div className="psi-studio">
				<div className="psi-studio__controls">
					<PractitionersCard people={setup.practitioners} rooms={setup.rooms} t={t} {...common} />
					<ServicesCard
						services={setup.services}
						people={setup.practitioners}
						language={language}
						t={t}
						{...common}
					/>
					<RoomsCard rooms={setup.rooms} today={setup.today} t={t} {...common} />
					<HoursCard
						people={setup.practitioners}
						services={setup.services}
						today={setup.today}
						t={t}
						{...common}
					/>
					<DaysOffCard
						people={setup.practitioners}
						today={setup.today}
						language={language}
						t={t}
						{...common}
					/>
				</div>
				<aside className="psi-studio__preview">
					<PreviewCard setup={setup} version={version} language={language} t={t} />
				</aside>
			</div>
			<div className="psi-sched__flash" role="status" aria-live="polite">
				{busy ? (
					<span className="psi-flash">{t("psi:scBusy")}</span>
				) : flash === null ? null : (
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
