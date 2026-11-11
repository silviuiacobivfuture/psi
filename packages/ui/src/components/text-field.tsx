/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface TextFieldProps {
	id: string;
	name: string;
	label: string;
	type?: "text" | "email" | "tel";
	hint?: string;
	/** Already-translated error text; the caller prefixes it ("Eroare: …"). */
	error?: string;
	placeholder?: string;
	value?: string;
	required?: boolean;
	attrs?: Record<string, string>;
	class?: string;
}

export function TextField({
	id,
	name,
	label,
	type = "text",
	hint,
	error,
	placeholder,
	value,
	required = false,
	attrs = {},
	class: className,
}: TextFieldProps): JSX.Element {
	const note = error ?? hint;
	return (
		<div class={cx("pz-field", error !== undefined && "pz-field--error", className)}>
			<label class="pz-field__label" for={id}>
				{label}
			</label>
			<input
				class="pz-input"
				id={id}
				name={name}
				type={type}
				placeholder={placeholder}
				value={value}
				required={required}
				aria-invalid={error !== undefined ? "true" : undefined}
				aria-describedby={note !== undefined ? `${id}-hint` : undefined}
				{...attrs}
			/>
			{note !== undefined ? (
				<span class="pz-field__hint" id={`${id}-hint`}>
					{note}
				</span>
			) : null}
		</div>
	);
}
