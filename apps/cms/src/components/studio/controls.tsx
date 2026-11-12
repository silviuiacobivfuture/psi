"use client";
import { type KeyboardEvent, type ReactElement, type ReactNode, useId, useState } from "react";

/**
 * The studio's building blocks, on native inputs (radio groups, switches, text fields) so the
 * keyboard, the screen reader and the disabled state work as the platform does. Styled in
 * psi-studio.css from the admin's tokens; no colour lives here.
 */

/** A section of the studio: a title, one line saying what it is for, and its controls. */
export function Card({
	id,
	icon,
	title,
	hint,
	children,
	aside,
}: {
	id: string;
	icon: ReactNode;
	title: string;
	hint: string;
	children: ReactNode;
	aside?: ReactNode;
}): ReactElement {
	return (
		<section className="psi-sc" aria-labelledby={`${id}-title`} id={id}>
			<header className="psi-sc__head">
				<span className="psi-sc__icon" aria-hidden="true">
					{icon}
				</span>
				<div className="psi-sc__titles">
					<h2 className="psi-sc__title" id={`${id}-title`}>
						{title}
					</h2>
					<p className="psi-sc__hint">{hint}</p>
				</div>
				{aside === undefined ? null : <div className="psi-sc__aside">{aside}</div>}
			</header>
			<div className="psi-sc__body">{children}</div>
		</section>
	);
}

/** One labelled row inside a card: the label and its helper line on the left, the control right. */
export function Row({
	label,
	help,
	children,
	labelFor,
}: {
	label: string;
	help?: string;
	children: ReactNode;
	labelFor?: string;
}): ReactElement {
	return (
		<div className="psi-row">
			<div className="psi-row__text">
				{labelFor === undefined ? (
					<span className="psi-row__label">{label}</span>
				) : (
					<label className="psi-row__label" htmlFor={labelFor}>
						{label}
					</label>
				)}
				{help === undefined ? null : <span className="psi-row__help">{help}</span>}
			</div>
			<div className="psi-row__control">{children}</div>
		</div>
	);
}

export interface Option<V extends string> {
	value: V;
	label: string;
	/** A second, smaller line under the label (a price, an explanation). */
	detail?: string;
}

/** A segmented control: one radio group, every option visible, the chosen one in gold. */
export function Segmented<V extends string>({
	name,
	label,
	value,
	options,
	onChange,
	disabled = false,
	size = "md",
}: {
	name: string;
	label: string;
	value: V;
	options: ReadonlyArray<Option<V>>;
	onChange: (v: V) => void;
	disabled?: boolean;
	size?: "sm" | "md" | "lg";
}): ReactElement {
	const id = useId();
	return (
		<fieldset className={`psi-seg psi-seg--${size}`} disabled={disabled}>
			<legend className="psi-visually-hidden">{label}</legend>
			{options.map((o) => (
				<label key={o.value} className="psi-seg__opt">
					<input
						type="radio"
						name={`${name}-${id}`}
						value={o.value}
						checked={o.value === value}
						onChange={() => onChange(o.value)}
					/>
					<span className="psi-seg__label">{o.label}</span>
					{o.detail === undefined ? null : <span className="psi-seg__detail">{o.detail}</span>}
				</label>
			))}
		</fieldset>
	);
}

/** A switch: a checkbox with the switch role, its label beside it. */
export function Toggle({
	label,
	checked,
	onChange,
	disabled = false,
	onLabel,
	offLabel,
}: {
	label: string;
	checked: boolean;
	onChange: (v: boolean) => void;
	disabled?: boolean;
	onLabel: string;
	offLabel: string;
}): ReactElement {
	return (
		<label className="psi-toggle">
			<input
				type="checkbox"
				role="switch"
				aria-checked={checked}
				checked={checked}
				disabled={disabled}
				aria-label={label}
				onChange={(e) => onChange(e.currentTarget.checked)}
			/>
			<span className="psi-toggle__track" aria-hidden="true">
				<span className="psi-toggle__thumb" />
			</span>
			<span className="psi-toggle__state">{checked ? onLabel : offLabel}</span>
		</label>
	);
}

/** A whole number with − and + beside it, within bounds. */
export function Stepper({
	id,
	value,
	min,
	max,
	onChange,
	disabled = false,
	unit,
	less,
	more,
}: {
	id: string;
	value: number;
	min: number;
	max: number;
	onChange: (v: number) => void;
	disabled?: boolean;
	unit: string;
	less: string;
	more: string;
}): ReactElement {
	const clamp = (n: number): number => Math.min(max, Math.max(min, Math.round(n)));
	return (
		<div className="psi-stepper">
			<button
				type="button"
				className="psi-btn psi-btn--icon"
				aria-label={less}
				disabled={disabled || value <= min}
				onClick={() => onChange(clamp(value - 1))}
			>
				−
			</button>
			<input
				id={id}
				type="number"
				inputMode="numeric"
				min={min}
				max={max}
				step={1}
				value={value}
				disabled={disabled}
				onChange={(e) => {
					const n = Number(e.currentTarget.value);
					if (Number.isFinite(n)) onChange(clamp(n));
				}}
			/>
			<button
				type="button"
				className="psi-btn psi-btn--icon"
				aria-label={more}
				disabled={disabled || value >= max}
				onClick={() => onChange(clamp(value + 1))}
			>
				+
			</button>
			<span className="psi-stepper__unit">{unit}</span>
		</div>
	);
}

/**
 * A list of short tags: each one removable, a field to add one (Enter or comma), and optional
 * suggestions to add with a click.
 */
export function TagInput({
	id,
	tags,
	onChange,
	max,
	maxLength,
	placeholder,
	removeLabel,
	suggestions = [],
	suggestLabel,
	disabled = false,
}: {
	id: string;
	tags: ReadonlyArray<string>;
	onChange: (tags: string[]) => void;
	max: number;
	maxLength: number;
	placeholder: string;
	removeLabel: (tag: string) => string;
	suggestions?: ReadonlyArray<string>;
	suggestLabel?: string;
	disabled?: boolean;
}): ReactElement {
	const [text, setText] = useState("");
	const has = (t: string): boolean => tags.some((x) => x.toLowerCase() === t.toLowerCase());
	const add = (raw: string): void => {
		const t = raw.trim().slice(0, maxLength);
		if (t === "" || has(t) || tags.length >= max) return;
		onChange([...tags, t]);
	};
	const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
		if (e.key === "Enter" || e.key === ",") {
			e.preventDefault();
			add(text);
			setText("");
		} else if (e.key === "Backspace" && text === "" && tags.length > 0) {
			onChange(tags.slice(0, -1));
		}
	};
	const open = suggestions.filter((s) => !has(s));
	return (
		<div className="psi-tags">
			<div className="psi-tags__box">
				{tags.map((t) => (
					<span key={t} className="psi-tag">
						{t}
						<button
							type="button"
							className="psi-tag__x"
							aria-label={removeLabel(t)}
							disabled={disabled}
							onClick={() => onChange(tags.filter((x) => x !== t))}
						>
							×
						</button>
					</span>
				))}
				<input
					id={id}
					value={text}
					disabled={disabled || tags.length >= max}
					placeholder={tags.length >= max ? "" : placeholder}
					maxLength={maxLength}
					onChange={(e) => setText(e.currentTarget.value)}
					onKeyDown={onKey}
					onBlur={() => {
						add(text);
						setText("");
					}}
				/>
			</div>
			{open.length === 0 || disabled ? null : (
				<div className="psi-tags__suggest">
					{suggestLabel === undefined ? null : (
						<span className="psi-tags__suggest-label">{suggestLabel}</span>
					)}
					{open.slice(0, 12).map((s) => (
						<button
							key={s}
							type="button"
							className="psi-chip psi-chip--add"
							disabled={tags.length >= max}
							onClick={() => add(s)}
						>
							+ {s}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

/**
 * A line of copy: empty means the site's built-in text, shown as the placeholder; once set, a
 * "restore default" link clears it. Counts characters against its limit.
 */
export function CopyField({
	id,
	label,
	help,
	value,
	placeholder,
	maxLength,
	onChange,
	restoreLabel,
	customLabel,
	disabled = false,
	rows = 2,
}: {
	id: string;
	label: string;
	help?: string;
	value: string | undefined;
	placeholder: string;
	maxLength: number;
	onChange: (v: string | undefined) => void;
	restoreLabel: string;
	customLabel: string;
	disabled?: boolean;
	rows?: number;
}): ReactElement {
	const set = value !== undefined && value !== "";
	return (
		<div className="psi-copy">
			<div className="psi-copy__head">
				<label htmlFor={id} className="psi-row__label">
					{label}
				</label>
				{set ? <span className="psi-pill psi-pill--gold">{customLabel}</span> : null}
				{set && !disabled ? (
					<button
						type="button"
						className="psi-btn psi-btn--link"
						onClick={() => onChange(undefined)}
					>
						{restoreLabel}
					</button>
				) : null}
			</div>
			{help === undefined ? null : <p className="psi-row__help">{help}</p>}
			<textarea
				id={id}
				rows={rows}
				value={value ?? ""}
				placeholder={placeholder}
				maxLength={maxLength}
				disabled={disabled}
				onChange={(e) => onChange(e.currentTarget.value === "" ? undefined : e.currentTarget.value)}
			/>
		</div>
	);
}
