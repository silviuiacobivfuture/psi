"use client";
import {
	type AiBehaviour,
	type ConversationStyle,
	EXTRA_INSTRUCTIONS_MAX,
	presetOf,
	TONE_PRESETS,
	TOPIC_MAX,
	TOPICS_MAX,
	type TonePreset,
} from "@psi/cms-client/behaviour";
import type { ReactElement } from "react";
import { Card, Row, Segmented, TagInput } from "./controls";
import { IconLock, IconTopics, IconVoice } from "./icons";
import { fill, type T } from "./types";

type Patch = (b: Partial<AiBehaviour>) => void;

const PRESETS: ReadonlyArray<TonePreset> = ["warm", "calm", "concise"];

/** Voice and personality: a tone preset, the four fine controls, emoji (locked), the team's notes. */
export function VoiceCard({
	behaviour,
	patch,
	disabled,
	t,
}: {
	behaviour: AiBehaviour;
	patch: Patch;
	disabled: boolean;
	t: T;
}): ReactElement {
	const style = behaviour.style;
	const preset = presetOf(style);
	const setStyle = (s: Partial<ConversationStyle>): void => patch({ style: { ...style, ...s } });
	const used = behaviour.extraInstructions.length;
	return (
		<Card id="voice" icon={<IconVoice />} title={t("psi:stVoiceTitle")} hint={t("psi:stVoiceHint")}>
			<fieldset className="psi-presets" disabled={disabled}>
				<legend className="psi-visually-hidden">{t("psi:stPresets")}</legend>
				{PRESETS.map((p) => (
					<label key={p} className="psi-preset">
						<input
							type="radio"
							name="tone-preset"
							value={p}
							checked={preset === p}
							onChange={() => patch({ style: { ...TONE_PRESETS[p] } })}
						/>
						<span className="psi-preset__name">{t(`psi:stPreset_${p}`)}</span>
						<span className="psi-preset__desc">{t(`psi:stPreset_${p}_desc`)}</span>
						<span className="psi-preset__sample">{t(`psi:stPreset_${p}_sample`)}</span>
					</label>
				))}
			</fieldset>
			{preset === null ? <p className="psi-note">{t("psi:stPresetCustom")}</p> : null}
			<Row label={t("psi:stWarmth")} help={t("psi:stWarmthHelp")}>
				<Segmented
					name="warmth"
					label={t("psi:stWarmth")}
					value={style.warmth}
					disabled={disabled}
					onChange={(warmth) => setStyle({ warmth })}
					options={[
						{ value: "low", label: t("psi:stLevel_low") },
						{ value: "medium", label: t("psi:stLevel_medium") },
						{ value: "high", label: t("psi:stLevel_high") },
					]}
				/>
			</Row>
			<Row label={t("psi:stLength")} help={t("psi:stLengthHelp")}>
				<Segmented
					name="length"
					label={t("psi:stLength")}
					value={style.length}
					disabled={disabled}
					onChange={(length) => setStyle({ length })}
					options={[
						{ value: "short", label: t("psi:stLength_short") },
						{ value: "medium", label: t("psi:stLength_medium") },
						{ value: "long", label: t("psi:stLength_long") },
					]}
				/>
			</Row>
			<Row label={t("psi:stFormality")} help={t("psi:stFormalityHelp")}>
				<Segmented
					name="formality"
					label={t("psi:stFormality")}
					value={style.formality}
					disabled={disabled}
					onChange={(formality) => setStyle({ formality })}
					options={[
						{ value: "informal", label: "tu" },
						{ value: "formal", label: "dumneavoastră" },
					]}
				/>
			</Row>
			<Row label={t("psi:stFollowUps")} help={t("psi:stFollowUpsHelp")}>
				<Segmented
					name="followUps"
					label={t("psi:stFollowUps")}
					value={style.followUps}
					disabled={disabled}
					onChange={(followUps) => setStyle({ followUps })}
					options={[
						{ value: "never", label: t("psi:stFollow_never") },
						{ value: "sometimes", label: t("psi:stFollow_sometimes") },
						{ value: "often", label: t("psi:stFollow_often") },
					]}
				/>
			</Row>
			<Row label={t("psi:stEmoji")} help={t("psi:stEmojiHelp")}>
				<span className="psi-locked">
					<IconLock /> {t("psi:stEmojiNever")}
				</span>
			</Row>
			<div className="psi-copy">
				<div className="psi-copy__head">
					<label htmlFor="extra-instructions" className="psi-row__label">
						{t("psi:stExtra")}
					</label>
					<span
						className={`psi-count${used > EXTRA_INSTRUCTIONS_MAX * 0.9 ? " psi-count--near" : ""}`}
					>
						{used} / {EXTRA_INSTRUCTIONS_MAX}
					</span>
				</div>
				<p className="psi-row__help">{t("psi:stExtraHelp")}</p>
				<textarea
					id="extra-instructions"
					rows={5}
					maxLength={EXTRA_INSTRUCTIONS_MAX}
					value={behaviour.extraInstructions}
					placeholder={t("psi:stExtraPlaceholder")}
					disabled={disabled}
					onChange={(e) => patch({ extraInstructions: e.currentTarget.value })}
				/>
			</div>
		</Card>
	);
}

/** Topics: what to put weight on (suggested from the knowledge base), what to avoid, the way to the team. */
export function TopicsCard({
	behaviour,
	patch,
	disabled,
	suggestions,
	books,
	t,
}: {
	behaviour: AiBehaviour;
	patch: Patch;
	disabled: boolean;
	suggestions: ReadonlyArray<string>;
	books: boolean;
	t: T;
}): ReactElement {
	const remove = (tag: string): string => fill(t("psi:stRemoveTag"), { tag });
	return (
		<Card
			id="topics"
			icon={<IconTopics />}
			title={t("psi:stTopicsTitle")}
			hint={t("psi:stTopicsHint")}
		>
			<div className="psi-copy">
				<label htmlFor="focus-topics" className="psi-row__label">
					{t("psi:stFocus")}
				</label>
				<p className="psi-row__help">{t("psi:stFocusHelp")}</p>
				<TagInput
					id="focus-topics"
					tags={behaviour.focusTopics}
					onChange={(focusTopics) => patch({ focusTopics })}
					max={TOPICS_MAX}
					maxLength={TOPIC_MAX}
					placeholder={t("psi:stTagPlaceholder")}
					removeLabel={remove}
					suggestions={suggestions}
					suggestLabel={t("psi:stFromKnowledge")}
					disabled={disabled}
				/>
			</div>
			<div className="psi-copy">
				<label htmlFor="avoid-topics" className="psi-row__label">
					{t("psi:stAvoid")}
				</label>
				<p className="psi-row__help">{t("psi:stAvoidHelp")}</p>
				<TagInput
					id="avoid-topics"
					tags={behaviour.avoidTopics}
					onChange={(avoidTopics) => patch({ avoidTopics })}
					max={TOPICS_MAX}
					maxLength={TOPIC_MAX}
					placeholder={t("psi:stTagPlaceholder")}
					removeLabel={remove}
					disabled={disabled}
				/>
			</div>
			<Row label={t("psi:stContact")} help={t("psi:stContactHelp")}>
				<Segmented
					name="contact"
					label={t("psi:stContact")}
					value={behaviour.contactRoute ?? "brand"}
					disabled={disabled}
					onChange={(v) => patch({ contactRoute: v === "brand" ? null : v })}
					options={[
						{ value: "brand", label: t("psi:stContact_brand") },
						{ value: "phone", label: t("psi:stContact_phone") },
						{ value: "contact", label: t("psi:stContact_contact") },
						...(books ? [{ value: "booking" as const, label: t("psi:stContact_booking") }] : []),
					]}
				/>
			</Row>
		</Card>
	);
}
