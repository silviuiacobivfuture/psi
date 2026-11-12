"use client";
import {
	type AiBehaviour,
	CHIP_MAX,
	CHIPS,
	COPY_LINE_MAX,
	type CopyDefaults,
	type GuideCopy,
} from "@psi/cms-client/behaviour";
import type { ReactElement } from "react";
import { Card, CopyField, Segmented } from "./controls";
import { IconChat } from "./icons";
import type { T } from "./types";

type Locale = "ro" | "en";
type Line = "welcome" | "outOfScope" | "unknown" | "exchangeLimit";

const LINES: ReadonlyArray<{ key: Line; rows: number }> = [
	{ key: "welcome", rows: 3 },
	{ key: "outOfScope", rows: 2 },
	{ key: "unknown", rows: 2 },
	{ key: "exchangeLimit", rows: 2 },
];

/**
 * The chips as the studio stores them: the three in order, each the owner's or the site's own;
 * none at all when every one is the site's (so a later change of the built-in copy still shows).
 */
export function chipsWith(
	current: ReadonlyArray<string> | undefined,
	defaults: ReadonlyArray<string>,
	index: number,
	value: string | undefined,
): string[] | undefined {
	const next = Array.from(
		{ length: CHIPS },
		(_, i) => (i === index ? value : current?.[i])?.trim() || defaults[i] || "",
	);
	const own = next.some((c, i) => c !== (defaults[i] ?? "") && c !== "");
	return own ? next.filter((c) => c !== "") : undefined;
}

/** Greeting and quick replies, per locale: each line defaults to the site's own, shown as placeholder. */
export function CopyCard({
	behaviour,
	patch,
	defaults,
	locale,
	setLocale,
	disabled,
	t,
}: {
	behaviour: AiBehaviour;
	patch: (b: Partial<AiBehaviour>) => void;
	defaults: { ro: CopyDefaults; en: CopyDefaults } | null;
	locale: Locale;
	setLocale: (l: Locale) => void;
	disabled: boolean;
	t: T;
}): ReactElement {
	const copy = behaviour.copy[locale];
	const own = defaults?.[locale];
	const setCopy = (c: GuideCopy): void => patch({ copy: { ...behaviour.copy, [locale]: c } });
	const setLine = (key: Line, v: string | undefined): void => {
		const { [key]: _old, ...rest } = copy;
		setCopy(v === undefined ? rest : { ...rest, [key]: v });
	};
	const setChips = (v: string[] | undefined): void => {
		const { chips: _old, ...rest } = copy;
		setCopy(v === undefined ? rest : { ...rest, chips: v });
	};
	const shared = {
		restoreLabel: t("psi:stRestore"),
		customLabel: t("psi:stCustom"),
		disabled,
	};
	return (
		<Card
			id="copy"
			icon={<IconChat />}
			title={t("psi:stCopyTitle")}
			hint={t("psi:stCopyHint")}
			aside={
				<Segmented
					name="copy-locale"
					label={t("psi:stLanguage")}
					value={locale}
					onChange={setLocale}
					options={[
						{ value: "ro", label: "RO" },
						{ value: "en", label: "EN" },
					]}
				/>
			}
		>
			{own === undefined ? (
				<p className="psi-note psi-note--warn">{t("psi:stNoDefaults")}</p>
			) : null}
			{LINES.slice(0, 1).map(({ key, rows }) => (
				<CopyField
					key={`${locale}-${key}`}
					id={`copy-${locale}-${key}`}
					label={t(`psi:stCopy_${key}`)}
					help={t(`psi:stCopy_${key}_help`)}
					value={copy[key]}
					placeholder={own?.[key] ?? ""}
					maxLength={COPY_LINE_MAX}
					rows={rows}
					onChange={(v) => setLine(key, v)}
					{...shared}
				/>
			))}
			<div className="psi-copy">
				<div className="psi-copy__head">
					<span className="psi-row__label" id={`chips-${locale}`}>
						{t("psi:stChips")}
					</span>
					{copy.chips === undefined ? null : (
						<>
							<span className="psi-pill psi-pill--gold">{t("psi:stCustom")}</span>
							{disabled ? null : (
								<button
									type="button"
									className="psi-btn psi-btn--link"
									onClick={() => setChips(undefined)}
								>
									{t("psi:stRestore")}
								</button>
							)}
						</>
					)}
				</div>
				<p className="psi-row__help">{t("psi:stChipsHelp")}</p>
				<fieldset className="psi-chips-edit" aria-labelledby={`chips-${locale}`}>
					{Array.from({ length: CHIPS }, (_, i) => {
						const fallback = own?.chips[i] ?? "";
						const shown = copy.chips?.[i];
						return (
							<input
								key={`${locale}-chip-${String(i)}`}
								name={`chip-${locale}-${String(i)}`}
								aria-label={`${t("psi:stChip")} ${String(i + 1)}`}
								value={shown !== undefined && shown !== fallback ? shown : ""}
								placeholder={fallback}
								maxLength={CHIP_MAX}
								disabled={disabled}
								onChange={(e) =>
									setChips(
										chipsWith(copy.chips, own?.chips ?? [], i, e.currentTarget.value || undefined),
									)
								}
							/>
						);
					})}
				</fieldset>
			</div>
			{LINES.slice(1).map(({ key, rows }) => (
				<CopyField
					key={`${locale}-${key}`}
					id={`copy-${locale}-${key}`}
					label={t(`psi:stCopy_${key}`)}
					help={t(`psi:stCopy_${key}_help`)}
					value={copy[key]}
					placeholder={own?.[key] ?? ""}
					maxLength={COPY_LINE_MAX}
					rows={rows}
					onChange={(v) => setLine(key, v)}
					{...shared}
				/>
			))}
		</Card>
	);
}
