"use client";
import { type ReactElement, useEffect, useId, useState } from "react";
import { type SetupState, whyEmpty } from "../../platform/scheduling-model";
import { Card } from "../studio/controls";
import { type Preview, readPreview } from "./api";
import { dayLabel, wallDate, wallTime } from "./format";
import { IconEye } from "./icons";
import { fill, type T } from "./types";

const MAX_DAYS = 6;

type Loaded = { state: "loading" } | { state: "error" } | { state: "ok"; preview: Preview };

/**
 * What visitors will see: the next free times of one service, read through the visitors' own
 * client (the one the sites and the chat call), so it can never disagree with them. When there
 * are none it says why and what the chat does meanwhile.
 */
export function PreviewCard({
	setup,
	version,
	language,
	t,
}: {
	setup: SetupState;
	/** Counts up after every change, to read the times again. */
	version: number;
	language: string;
	t: T;
}): ReactElement {
	const id = useId();
	const first = setup.services[0]?.slug ?? "";
	const [slug, setSlug] = useState(first);
	const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
	const [again, setAgain] = useState(0);
	const service = setup.services.find((s) => s.slug === slug) ?? setup.services[0];
	const key = service?.slug;

	// biome-ignore lint/correctness/useExhaustiveDependencies: `version` and `again` are the refresh triggers
	useEffect(() => {
		if (key === undefined) return;
		let live = true;
		setLoaded({ state: "loading" });
		void readPreview(setup.brand, key).then((r) => {
			if (live) setLoaded(r.ok ? { state: "ok", preview: r.data } : { state: "error" });
		});
		return () => {
			live = false;
		};
	}, [setup.brand, key, version, again]);

	const nameOf = (s: { name: { ro: string; en: string } | null; slug: string }): string =>
		(language === "en" ? s.name?.en : s.name?.ro) ?? s.slug;
	// The store offers one slot per mode; a visitor picks a time, so the page shows each time once.
	const slots = [
		...new Map(
			(loaded.state === "ok" ? loaded.preview.slots : []).map((s) => [
				`${s.start}-${s.practitioner}`,
				s,
			]),
		).values(),
	];
	const zone = loaded.state === "ok" ? loaded.preview.timeZone : setup.timeZone;
	const days = new Map<string, Array<{ start: number; practitioner: string }>>();
	for (const s of slots) {
		const date = wallDate(s.start, zone);
		days.set(date, [...(days.get(date) ?? []), s]);
	}
	const shown = [...days.entries()].slice(0, MAX_DAYS);
	const hidden = slots.length - shown.reduce((n, [, list]) => n + list.length, 0);

	return (
		<Card
			id="preview"
			icon={<IconEye />}
			title={t("psi:scPrevTitle")}
			hint={t("psi:scPrevHint")}
			aside={
				<button
					className="psi-btn psi-btn--ghost psi-btn--sm"
					type="button"
					onClick={() => setAgain((n) => n + 1)}
				>
					{t("psi:scPrevRefresh")}
				</button>
			}
		>
			{service === undefined ? (
				<>
					<p className="psi-note">{t("psi:scPrevNoService")}</p>
					<p className="psi-sc__hint">{t("psi:scPrevFallback")}</p>
				</>
			) : (
				<>
					{setup.services.length > 1 ? (
						<div className="psi-inline">
							<label htmlFor={id}>{t("psi:scPrevService")}</label>
							<select id={id} value={service.slug} onChange={(e) => setSlug(e.currentTarget.value)}>
								{setup.services.map((s) => (
									<option key={s.id} value={s.slug}>
										{nameOf(s)}
									</option>
								))}
							</select>
						</div>
					) : (
						<p className="psi-sub">{nameOf(service)}</p>
					)}
					<div aria-live="polite">
						{loaded.state === "loading" ? (
							<p className="psi-dim">{t("psi:scPrevLoading")}</p>
						) : null}
						{loaded.state === "error" ? (
							<p className="psi-note psi-note--warn">{t("psi:scPrevError")}</p>
						) : null}
						{loaded.state === "ok" && shown.length === 0 ? (
							<>
								<p className="psi-note psi-note--warn">
									{t(`psi:scWhy_${whyEmpty(setup, service)}`)}
								</p>
								<p className="psi-sc__hint">{t("psi:scPrevFallback")}</p>
							</>
						) : null}
						{loaded.state === "ok"
							? shown.map(([date, list]) => (
									<div key={date} className="psi-slotday">
										<h3 className="psi-slotday__date">{dayLabel(date, language)}</h3>
										<ul className="psi-slots">
											{list.map((s) => (
												<li
													key={`${s.start}-${s.practitioner}`}
													className="psi-slot"
													title={s.practitioner}
												>
													{wallTime(s.start, zone)}
												</li>
											))}
										</ul>
									</div>
								))
							: null}
						{hidden > 0 ? (
							<p className="psi-sc__hint">{fill(t("psi:scPrevMore"), { n: hidden })}</p>
						) : null}
					</div>
				</>
			)}
		</Card>
	);
}
