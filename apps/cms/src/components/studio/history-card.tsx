"use client";
import type { ReactElement } from "react";
import type { CustomKey } from "../../i18n";
import { type Change, diffSettings } from "../../studio/diff";
import { Card } from "./controls";
import { IconHistory } from "./icons";
import { fill, type T, type VersionRow } from "./types";

/** The labels of the fields a version can change (the copy lines have their own). */
const FIELD: Readonly<Record<string, CustomKey>> = {
	embeddings: "psi:stEmbeddings",
	embedModel: "psi:stEmbedModel",
	deepSearch: "psi:stDeep",
	guideEnabled: "psi:stGuideOn",
	exchangeLimit: "psi:stLimit",
	exchangeWindowHours: "psi:stWindow",
	screeningLevel: "psi:stScreening",
	warmth: "psi:stWarmth",
	length: "psi:stLength",
	formality: "psi:stFormality",
	followUps: "psi:stFollowUps",
	extraInstructions: "psi:stExtra",
	focusTopics: "psi:stFocus",
	avoidTopics: "psi:stAvoid",
	contactRoute: "psi:stContact",
	model: "psi:stModel",
	creativity: "psi:stCreativity",
};
const COPY_FIELD: Readonly<Record<string, CustomKey>> = {
	welcome: "psi:stCopy_welcome",
	chips: "psi:stChips",
	outOfScope: "psi:stCopy_outOfScope",
	unknown: "psi:stCopy_unknown",
	exchangeLimit: "psi:stCopy_exchangeLimit",
};

/** A changed field's name in the admin's language (a copy line with its language), else the path. */
function fieldName(path: string, t: T): string {
	const parts = path.split(".");
	const leaf = parts.at(-1) ?? path;
	if (parts[1] === "copy") {
		const key = COPY_FIELD[leaf];
		return key === undefined ? path : `${t(key)} (${(parts[2] ?? "").toUpperCase()})`;
	}
	const key = FIELD[leaf];
	return key === undefined ? path : t(key);
}

/** The words for a field's coded values (warmth "high" → "Cald"); other values show as they are. */
const VALUES: Readonly<Record<string, Readonly<Record<string, CustomKey>>>> = {
	warmth: { low: "psi:stLevel_low", medium: "psi:stLevel_medium", high: "psi:stLevel_high" },
	length: { short: "psi:stLength_short", medium: "psi:stLength_medium", long: "psi:stLength_long" },
	followUps: {
		never: "psi:stFollow_never",
		sometimes: "psi:stFollow_sometimes",
		often: "psi:stFollow_often",
	},
	creativity: {
		precise: "psi:stCreative_precise",
		balanced: "psi:stCreative_balanced",
		creative: "psi:stCreative_creative",
	},
	contactRoute: {
		phone: "psi:stContact_phone",
		contact: "psi:stContact_contact",
		booking: "psi:stContact_booking",
	},
	embeddings: { openrouter: "psi:stEmbed_openrouter", lexical: "psi:stEmbed_lexical" },
	guideEnabled: { true: "psi:stOn", false: "psi:stOff" },
	deepSearch: { true: "psi:stOn", false: "psi:stOff" },
};
const FORMALITY: Readonly<Record<string, string>> = { informal: "tu", formal: "dumneavoastră" };

function shown(path: string, value: string, t: T): string {
	if (value === "") return t("psi:stDefault");
	const leaf = path.split(".").at(-1) ?? path;
	if (leaf === "formality") return FORMALITY[value] ?? value;
	const key = VALUES[leaf]?.[value];
	return key === undefined ? shorten(value) : t(key);
}

const shorten = (s: string): string => (s.length > 90 ? `${s.slice(0, 88)}…` : s);

/** The differences between two versions as a short list: field, before → after. */
export function ChangeList({ changes, t }: { changes: ReadonlyArray<Change>; t: T }): ReactElement {
	if (changes.length === 0) return <p className="psi-note">{t("psi:stNoChanges")}</p>;
	return (
		<ul className="psi-diff">
			{changes.slice(0, 12).map((c) => (
				<li key={c.path}>
					<span className="psi-diff__field">{fieldName(c.path, t)}</span>
					<span className="psi-diff__before">{shown(c.path, c.before, t)}</span>
					<span className="psi-diff__arrow" aria-hidden="true">
						→
					</span>
					<span className="psi-visually-hidden">{t("psi:stBecomes")}</span>
					<span className="psi-diff__after">{shown(c.path, c.after, t)}</span>
				</li>
			))}
			{changes.length > 12 ? (
				<li className="psi-note">{fill(t("psi:stMoreChanges"), { n: changes.length - 12 })}</li>
			) : null}
		</ul>
	);
}

function when(iso: string, locale: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime())
		? iso
		: d.toLocaleString(locale === "en" ? "en-GB" : "ro-RO", {
				dateStyle: "medium",
				timeStyle: "short",
			});
}

/** Version history: who published what and when, the last change in detail, and a way back. */
export function HistoryCard({
	history,
	canEdit,
	busy,
	onRevert,
	adminLocale,
	t,
}: {
	history: ReadonlyArray<VersionRow>;
	canEdit: boolean;
	busy: boolean;
	onRevert: (v: VersionRow) => void;
	adminLocale: string;
	t: T;
}): ReactElement {
	const [latest, previous] = history;
	return (
		<Card
			id="history"
			icon={<IconHistory />}
			title={t("psi:stHistoryTitle")}
			hint={t("psi:stHistoryHint")}
		>
			{latest === undefined ? (
				<p className="psi-note">{t("psi:stNoHistory")}</p>
			) : (
				<>
					<h3 className="psi-sub">{t("psi:stLastChange")}</h3>
					<p className="psi-row__help">
						{fill(t("psi:stBy"), { who: latest.by ?? "—", when: when(latest.at, adminLocale) })}
					</p>
					<ChangeList changes={diffSettings(previous?.settings ?? null, latest.settings)} t={t} />
					<h3 className="psi-sub">{t("psi:stVersions")}</h3>
					<ol className="psi-versions">
						{history.map((v, i) => (
							<li key={v.id} className="psi-version">
								<span
									className={`psi-version__dot${i === 0 ? " psi-version__dot--live" : ""}`}
									aria-hidden="true"
								/>
								<div className="psi-version__text">
									<span className="psi-version__when">{when(v.at, adminLocale)}</span>
									<span className="psi-version__who">
										{v.by ?? "—"}
										{v.note === null ? "" : ` · ${t(noteKey(v.note))}`}
									</span>
								</div>
								{i === 0 ? (
									<span className="psi-pill psi-pill--ok">{t("psi:stLive")}</span>
								) : canEdit ? (
									<button
										type="button"
										className="psi-btn psi-btn--ghost psi-btn--sm"
										disabled={busy}
										onClick={() => onRevert(v)}
									>
										{t("psi:stRevert")}
									</button>
								) : null}
							</li>
						))}
					</ol>
				</>
			)}
		</Card>
	);
}

function noteKey(note: string): CustomKey {
	switch (note) {
		case "studio":
			return "psi:stNote_studio";
		case "revert":
			return "psi:stNote_revert";
		case "baseline":
			return "psi:stNote_baseline";
		default:
			return "psi:stNote_form";
	}
}
