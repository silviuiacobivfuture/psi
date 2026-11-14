/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { signalName } from "./signal-name";

export interface TextAreaProps {
	/** Unique in the page; it also names the field's Datastar signals. */
	id: string;
	name: string;
	label: string;
	value?: string;
	/** What the field is for, under it, always shown. */
	hint?: string;
	/** Fewer characters than this (after trimming) is too short. */
	minLength: number;
	maxLength: number;
	/** The live line while the text is shorter than `minLength` ("at least 10 characters"). */
	minHint: string;
	/** The error the server found: shown at once, until the text is long enough. */
	error?: string;
	/** What the field says when it is left too short (on blur): usually the same words as `error`. */
	invalid: string;
	rows?: number;
	required?: boolean;
	attrs?: Record<string, string>;
	class?: string;
}

/**
 * A multi-line text field in the design system's input language, with a character counter and a
 * live minimum hint. It is validated when the person leaves it (or by the server on submit), never
 * while they type: typing only clears an error once the text is long enough.
 */
export function TextArea({
	id,
	name,
	label,
	value = "",
	hint,
	minLength,
	maxLength,
	minHint,
	error,
	invalid,
	rows = 5,
	required = false,
	attrs = {},
	class: className,
}: TextAreaProps): JSX.Element {
	const s = signalName(id);
	const length = value.length;
	const trimmed = value.replace(/\r\n?/g, "\n").trim().length;
	const signals = JSON.stringify({
		[`${s}N`]: length,
		[`${s}T`]: trimmed,
		[`${s}Bad`]: error !== undefined,
	});
	const hintId = hint === undefined ? "" : `${id}-hint`;
	// Only what is on screen describes the field: a hidden error or minimum is not read out.
	const describedBy = [
		error === undefined ? "" : `${id}-error`,
		error === undefined && trimmed < minLength ? `${id}-min` : "",
		hintId,
	]
		.filter((x) => x !== "")
		.join(" ");
	const liveDescribedBy = `[$${s}Bad ? '${id}-error' : '', !$${s}Bad && $${s}T < ${minLength} ? '${id}-min' : '', '${hintId}'].filter((x) => x !== '').join(' ')`;
	return (
		<div
			class={cx("pz-field", error !== undefined && "pz-field--error", className)}
			data-signals={signals}
			data-class:pz-field--error={`$${s}Bad`}
		>
			<label class="pz-field__label" for={id}>
				{label}
			</label>
			<textarea
				class="pz-input pz-textarea"
				id={id}
				name={name}
				rows={rows}
				required={required}
				minlength={minLength}
				maxlength={maxLength}
				aria-invalid={error !== undefined ? "true" : "false"}
				aria-describedby={describedBy}
				data-on:input={`$${s}N = el.value.length; $${s}T = el.value.trim().length; $${s}Bad = $${s}Bad && $${s}T < ${minLength}`}
				data-on:blur={`$${s}Bad = $${s}Bad || ($${s}T > 0 && $${s}T < ${minLength})`}
				data-attr:aria-invalid={`$${s}Bad ? 'true' : 'false'`}
				data-attr:aria-describedby={liveDescribedBy}
				{...attrs}
			>
				{value}
			</textarea>
			<p
				class="pz-field__error"
				id={`${id}-error`}
				aria-live="polite"
				data-show={`$${s}Bad`}
				style={error === undefined ? "display: none" : undefined}
			>
				{error ?? invalid}
			</p>
			<div class="pz-field__foot">
				<span
					id={`${id}-min`}
					data-show={`!$${s}Bad && $${s}T < ${minLength}`}
					style={error !== undefined || trimmed >= minLength ? "display: none" : undefined}
				>
					{minHint}
				</span>
				<span class="pz-field__count" data-text={`$${s}N + ' / ${maxLength}'`}>
					{`${length} / ${maxLength}`}
				</span>
			</div>
			{hint === undefined ? null : (
				<span class="pz-field__note" id={`${id}-hint`}>
					{hint}
				</span>
			)}
		</div>
	);
}
