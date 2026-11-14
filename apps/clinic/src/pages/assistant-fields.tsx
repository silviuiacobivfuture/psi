import {
	ASSISTANT_LANGUAGES,
	ASSISTANT_TONES,
	type AssistantCeilingsType,
	type AssistantSettingsType,
	type AssistantSurfaceName,
	type AssistantUsageMeterType,
} from "@psi/scheduling-sdk/contract";
import type { JSX } from "hono/jsx/jsx-runtime";
import { FIELD_GROUPS, fieldsOf, type SettingField, shown, valueAt } from "../lib/assistant-form";
import type { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";

type O = ReturnType<typeof at>;

const GROUP_TITLE = {
	access: (o: O) => m.as_group_access({}, o),
	model: (o: O) => m.as_group_model({}, o),
	limits: (o: O) => m.as_group_limits({}, o),
	prompt: (o: O) => m.as_group_prompt({}, o),
	booking: (o: O) => m.as_group_booking({}, o),
	handoff: (o: O) => m.as_group_handoff({}, o),
	memory: (o: O) => m.as_group_memory({}, o),
	logging: (o: O) => m.as_group_logging({}, o),
} as const;

const TONE = {
	warm: (o: O) => m.as_tone_warm({}, o),
	neutral: (o: O) => m.as_tone_neutral({}, o),
	formal: (o: O) => m.as_tone_formal({}, o),
} as const;
const LANGUAGE = {
	auto: (o: O) => m.as_lang_auto({}, o),
	ro: (o: O) => m.as_lang_ro({}, o),
	en: (o: O) => m.as_lang_en({}, o),
} as const;

const isTone = (v: string): v is keyof typeof TONE => Object.hasOwn(TONE, v);
const isLanguage = (v: string): v is keyof typeof LANGUAGE => Object.hasOwn(LANGUAGE, v);

/** A field's element id, from its form name. */
export const idOf = (name: string): string => `as-${name.replace(/[^A-Za-z0-9_-]/g, "-")}`;

/** A choice with "inherited" first, naming what is inherited. */
function Choice(props: {
	name: string;
	value: string;
	inherited: string;
	options: ReadonlyArray<{ value: string; label: string }>;
	o: O;
}): JSX.Element {
	return (
		<select class="adm-input" id={idOf(props.name)} name={props.name}>
			<option value="" selected={props.value === ""}>
				{`${m.as_inherit({}, props.o)} (${props.inherited})`}
			</option>
			{props.options.map((x) => (
				<option key={x.value} value={x.value} selected={props.value === x.value}>
					{x.label}
				</option>
			))}
		</select>
	);
}

function Input(props: {
	field: SettingField;
	name: string;
	value: string;
	inherited: string;
	ceiling: string | undefined;
	o: O;
}): JSX.Element {
	const { field, name, value, inherited, o } = props;
	const onOff = [
		{ value: "on", label: m.as_on({}, o) },
		{ value: "off", label: m.as_off({}, o) },
	];
	const label = (inheritedOf: (v: string) => string) => inheritedOf(inherited);
	let control: JSX.Element;
	switch (field.kind) {
		case "bool":
			control = (
				<Choice
					name={name}
					value={value}
					inherited={label((v) => (v === "on" ? m.as_on({}, o) : m.as_off({}, o)))}
					options={onOff}
					o={o}
				/>
			);
			break;
		case "tone":
			control = (
				<Choice
					name={name}
					value={value}
					inherited={isTone(inherited) ? TONE[inherited](o) : inherited}
					options={ASSISTANT_TONES.map((t) => ({ value: t, label: TONE[t](o) }))}
					o={o}
				/>
			);
			break;
		case "language":
			control = (
				<Choice
					name={name}
					value={value}
					inherited={isLanguage(inherited) ? LANGUAGE[inherited](o) : inherited}
					options={ASSISTANT_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE[l](o) }))}
					o={o}
				/>
			);
			break;
		case "long":
			control = (
				<textarea
					class="adm-input"
					id={idOf(name)}
					name={name}
					rows={4}
					maxlength={8_000}
					placeholder={inherited}
				>
					{value}
				</textarea>
			);
			break;
		case "int":
		case "num":
		case "usd":
			control = (
				<input
					class="adm-input"
					id={idOf(name)}
					name={name}
					type="number"
					step={field.kind === "int" ? "1" : "any"}
					min="0"
					value={value}
					placeholder={inherited}
				/>
			);
			break;
		case "text":
		case "list":
			control = (
				<input
					class="adm-input"
					id={idOf(name)}
					name={name}
					value={value}
					placeholder={inherited}
					maxlength={400}
				/>
			);
			break;
		default: {
			const never: never = field.kind;
			return never;
		}
	}
	return (
		<div class="adm-field">
			<label for={idOf(name)}>{m[field.key]({}, o)}</label>
			{control}
			{props.ceiling === undefined ? null : (
				<small class="adm-muted">{m.as_ceiling({ max: props.ceiling }, o)}</small>
			)}
		</div>
	);
}

/**
 * One surface's settings as fieldsets: each field shows the tier's own value (empty: inherited) with what it inherits
 * as its placeholder, and the platform's ceiling beside it.
 */
export function SurfaceFields(props: {
	surface: AssistantSurfaceName;
	prefix: string;
	own: unknown;
	inherited: AssistantSettingsType;
	ceilings: AssistantCeilingsType | undefined;
	o: O;
	note?: JSX.Element;
}): JSX.Element {
	const { surface, prefix, own, inherited, ceilings, o } = props;
	const fields = fieldsOf(surface);
	return (
		<div class="adm-stack">
			{surface === "visitor" ? (
				<p class="adm-muted" data-note="visitor-content">
					{m.as_visitor_content({}, o)}
				</p>
			) : null}
			{FIELD_GROUPS.map((group) => {
				const inGroup = fields.filter((x) => x.group === group);
				if (inGroup.length === 0) return null;
				return (
					<fieldset key={group} class="adm-card adm-stack" data-group={`${surface}.${group}`}>
						<legend class="adm-h3">{GROUP_TITLE[group](o)}</legend>
						{group === "booking" ? props.note : null}
						<div class="adm-grid">
							{inGroup.map((field) => {
								const max =
									field.ceiling === undefined || ceilings === undefined
										? undefined
										: ceilings[field.ceiling];
								return (
									<Input
										key={field.path}
										field={field}
										name={`${prefix}.${field.path}`}
										value={shown(field.kind, valueAt(own, field.path))}
										inherited={shown(field.kind, valueAt(inherited, field.path))}
										ceiling={
											max === undefined || typeof max === "object"
												? undefined
												: shown(field.kind, max)
										}
										o={o}
									/>
								);
							})}
						</div>
					</fieldset>
				);
			})}
		</div>
	);
}

const usd = (micro: number, locale: string): string =>
	new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 2,
	}).format(micro / 1_000_000);
const count = (n: number, locale: string): string =>
	new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "en-GB").format(n);

/** One meter: messages, tokens (cached), cost and limits met. */
export function Meter(props: {
	title: string;
	meter: AssistantUsageMeterType;
	locale: string;
	o: O;
}): JSX.Element {
	const { meter, locale, o } = props;
	return (
		<div class="adm-stack" data-meter={props.title}>
			<strong>{props.title}</strong>
			<dl class="adm-stack">
				<div class="adm-row">
					<dt class="adm-muted">{m.as_m_messages({}, o)}</dt>
					<dd>{count(meter.messages, locale)}</dd>
				</div>
				<div class="adm-row">
					<dt class="adm-muted">{m.as_m_tokens({}, o)}</dt>
					<dd>{`${count(meter.inputTokens + meter.outputTokens, locale)} (${count(meter.cachedTokens, locale)})`}</dd>
				</div>
				<div class="adm-row">
					<dt class="adm-muted">{m.as_m_cost({}, o)}</dt>
					<dd>{usd(meter.costMicroUsd, locale)}</dd>
				</div>
				<div class="adm-row">
					<dt class="adm-muted">{m.as_m_limits({}, o)}</dt>
					<dd>{count(meter.limitHits, locale)}</dd>
				</div>
			</dl>
		</div>
	);
}

/** How much of the monthly budget is spent, as words and a native meter (read by assistive technology as a value). */
export function Budget(props: { used: number; total: number; locale: string; o: O }): JSX.Element {
	const { used, total, locale, o } = props;
	const words = m.as_m_budget({ used: usd(used, locale), total: usd(total, locale) }, o);
	return (
		<div class="adm-stack">
			<span>{words}</span>
			<meter
				min={0}
				max={Math.max(total, 1)}
				value={Math.min(used, Math.max(total, 1))}
				high={total * 0.8}
				aria-label={words}
			/>
		</div>
	);
}
