/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export type FieldAutocomplete =
	| "name"
	| "given-name"
	| "family-name"
	| "email"
	| "tel"
	| "organization"
	| "off";

const AUTOCOMPLETE_BY_TYPE: Readonly<Record<string, FieldAutocomplete>> = {
	email: "email",
	tel: "tel",
};

export interface TextFieldProps {
	id: string;
	name: string;
	label: string;
	type?: "text" | "email" | "tel";
	/** What the browser may fill in; defaults to the type ("email", "tel"), so a phone offers it. */
	autocomplete?: FieldAutocomplete;
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
	autocomplete = AUTOCOMPLETE_BY_TYPE[type],
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
				autocomplete={autocomplete}
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
