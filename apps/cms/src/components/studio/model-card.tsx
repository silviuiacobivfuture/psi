"use client";
import { type AiBehaviour, FIXED_TEMPERATURE_MODELS } from "@psi/cms-client/behaviour";
import type { ReactElement } from "react";
import { Card, Row, Segmented, Stepper, Toggle } from "./controls";
import { IconLock, IconShield } from "./icons";
import { fill, type ModelRow, type Settings, type T } from "./types";

const usd = (n: number): string => `$${n.toFixed(2)}`;

/** A model's price line, per million tokens, or nothing when OpenRouter did not answer. */
function price(m: ModelRow, t: T): string | undefined {
	if (m.input === null || m.output === null) return undefined;
	return fill(t("psi:stPrice"), { input: usd(m.input), output: usd(m.output) });
}

/**
 * Model and safety: the guide on or off, the model (allowed ones, priced), creativity, the
 * screening level, the limits, retrieval; crisis handling shown locked, always on.
 */
export function ModelCard({
	settings,
	set,
	patch,
	models,
	siteModel,
	disabled,
	t,
}: {
	settings: Settings;
	set: (s: Partial<Settings>) => void;
	patch: (b: Partial<AiBehaviour>) => void;
	models: ReadonlyArray<ModelRow>;
	siteModel: string | null;
	disabled: boolean;
	t: T;
}): ReactElement {
	const b = settings.behaviour;
	const chosen = b.model ?? "site";
	return (
		<Card
			id="model"
			icon={<IconShield />}
			title={t("psi:stModelTitle")}
			hint={t("psi:stModelHint")}
		>
			<Row label={t("psi:stGuideOn")} help={t("psi:stGuideOnHelp")}>
				<Toggle
					label={t("psi:stGuideOn")}
					checked={settings.guideEnabled}
					disabled={disabled}
					onChange={(guideEnabled) => set({ guideEnabled })}
					onLabel={t("psi:stOn")}
					offLabel={t("psi:stOff")}
				/>
			</Row>
			<div className="psi-copy">
				<span className="psi-row__label" id="model-label">
					{t("psi:stModel")}
				</span>
				<p className="psi-row__help">{t("psi:stModelHelp")}</p>
				<fieldset className="psi-models" disabled={disabled} aria-labelledby="model-label">
					<label className="psi-model">
						<input
							type="radio"
							name="model"
							checked={chosen === "site"}
							onChange={() => patch({ model: null })}
						/>
						<span className="psi-model__name">{t("psi:stModelSite")}</span>
						<span className="psi-model__id">{siteModel ?? "—"}</span>
						<span className="psi-model__price">{t("psi:stModelSiteHelp")}</span>
					</label>
					{models.map((m) => (
						<label key={m.id} className="psi-model">
							<input
								type="radio"
								name="model"
								checked={chosen === m.id}
								onChange={() => patch({ model: m.id })}
							/>
							<span className="psi-model__name">{m.name}</span>
							<span className="psi-model__id">{m.id}</span>
							<span className="psi-model__price">{price(m, t) ?? t("psi:stPriceUnknown")}</span>
						</label>
					))}
				</fieldset>
			</div>
			<Row
				label={t("psi:stCreativity")}
				help={
					b.model !== null && FIXED_TEMPERATURE_MODELS.includes(b.model)
						? t("psi:stCreativityFixed")
						: t("psi:stCreativityHelp")
				}
			>
				<Segmented
					name="creativity"
					label={t("psi:stCreativity")}
					value={b.creativity}
					disabled={disabled}
					onChange={(creativity) => patch({ creativity })}
					options={[
						{ value: "precise", label: t("psi:stCreative_precise") },
						{ value: "balanced", label: t("psi:stCreative_balanced") },
						{ value: "creative", label: t("psi:stCreative_creative") },
					]}
				/>
			</Row>
			<div className="psi-copy">
				<span className="psi-row__label">{t("psi:stScreening")}</span>
				<Segmented
					name="screening"
					label={t("psi:stScreening")}
					value={settings.screeningLevel}
					disabled={disabled}
					size="lg"
					onChange={(screeningLevel) => set({ screeningLevel })}
					options={[
						{ value: "standard", label: "Standard", detail: t("psi:stScreen_standard") },
						{ value: "strict", label: "Strict", detail: t("psi:stScreen_strict") },
					]}
				/>
			</div>
			<Row label={t("psi:stLimit")} help={t("psi:stLimitHelp")} labelFor="limit">
				<Stepper
					id="limit"
					value={settings.exchangeLimit}
					min={1}
					max={200}
					disabled={disabled}
					unit={t("psi:stQuestions")}
					less={t("psi:stLess")}
					more={t("psi:stMore")}
					onChange={(exchangeLimit) => set({ exchangeLimit })}
				/>
			</Row>
			<Row label={t("psi:stWindow")} help={t("psi:stWindowHelp")} labelFor="window">
				<Stepper
					id="window"
					value={settings.exchangeWindowHours}
					min={1}
					max={168}
					disabled={disabled}
					unit={t("psi:stHours")}
					less={t("psi:stLess")}
					more={t("psi:stMore")}
					onChange={(exchangeWindowHours) => set({ exchangeWindowHours })}
				/>
			</Row>
			<Row label={t("psi:stEmbeddings")} help={t("psi:stEmbeddingsHelp")}>
				<Segmented
					name="embeddings"
					label={t("psi:stEmbeddings")}
					value={settings.embeddings}
					disabled={disabled}
					onChange={(embeddings) => set({ embeddings })}
					options={[
						{ value: "openrouter", label: t("psi:stEmbed_openrouter") },
						{ value: "lexical", label: t("psi:stEmbed_lexical") },
					]}
				/>
			</Row>
			{settings.embeddings === "openrouter" ? (
				<Row label={t("psi:stEmbedModel")} help={t("psi:stEmbedModelHelp")}>
					<Segmented
						name="embedModel"
						label={t("psi:stEmbedModel")}
						value={settings.embedModel}
						disabled={disabled}
						onChange={(embedModel) => set({ embedModel })}
						options={[
							{ value: "openai/text-embedding-3-small", label: "3-small" },
							{ value: "openai/text-embedding-3-large", label: "3-large" },
						]}
					/>
				</Row>
			) : null}
			<Row label={t("psi:stDeep")} help={t("psi:stDeepHelp")}>
				<Toggle
					label={t("psi:stDeep")}
					checked={settings.deepSearch}
					disabled={disabled}
					onChange={(deepSearch) => set({ deepSearch })}
					onLabel={t("psi:stOn")}
					offLabel={t("psi:stOff")}
				/>
			</Row>
			<div className="psi-crisis" role="note">
				<span className="psi-crisis__icon" aria-hidden="true">
					<IconLock size={18} />
				</span>
				<div>
					<strong>{t("psi:stCrisis")}</strong>
					<p>{t("psi:stCrisisHelp")}</p>
				</div>
				<span className="psi-pill psi-pill--ok">{t("psi:stAlwaysOn")}</span>
			</div>
		</Card>
	);
}
