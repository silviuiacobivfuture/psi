/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { CheckIcon } from "./icons";
import { TAKE_FOCUS } from "./take-focus";

export interface ChoiceOption {
	value: string;
	label: string;
}

export interface ChoiceGroupProps {
	/** Unique in the page: the group's error is `${id}-error`. */
	id: string;
	name: string;
	legend: string;
	options: ReadonlyArray<ChoiceOption>;
	/** "radio": exactly one (arrow keys move and select). "checkbox": any number (space toggles). */
	type: "radio" | "checkbox";
	/** The values ticked when the page is drawn. */
	checked: ReadonlyArray<string>;
	/**
	 * Checkboxes only: the option that stands alone ("any time"). Ticking it clears the others,
	 * ticking another clears it.
	 */
	exclusive?: string;
	required?: boolean;
	/** The first option takes the focus (the group holds the form's first error). */
	autofocus?: boolean;
	/** Already-translated error text, shown under the options. */
	error?: string;
	class?: string;
}

/** An option value as it may stand, unquoted, in the handler's selectors: a plain token. */
const TOKEN = /^[a-z0-9-]+$/;

/** Datastar's change handler for an `exclusive` option (an expression, so no statement braces). */
function exclusiveHandler(value: string): string {
	if (!TOKEN.test(value)) throw new Error(`exclusive choice "${value}" is not a plain token`);
	return `evt.target.checked && (evt.target.value === '${value}' ? el.querySelectorAll('input:not([value=${value}])').forEach((i) => (i.checked = false)) : (el.querySelector('input[value=${value}]').checked = false))`;
}

/**
 * Choice chips as real form controls: native radios or checkboxes (their checked state, keyboard and
 * submission come from the browser, with or without script), each in a 44px pill whose ticked state
 * is filled with the accent and carries a check mark, and whose focus draws the focus ring.
 */
export function ChoiceGroup({
	id,
	name,
	legend,
	options,
	type,
	checked,
	exclusive,
	required = false,
	autofocus = false,
	error,
	class: className,
}: ChoiceGroupProps): JSX.Element {
	const errorId = `${id}-error`;
	const isRadio = type === "radio";
	return (
		<fieldset
			id={id}
			class={cx("pz-choices", error !== undefined && "pz-choices--error", className)}
			role={isRadio ? "radiogroup" : undefined}
			aria-invalid={isRadio && error !== undefined ? "true" : undefined}
			aria-describedby={error !== undefined ? errorId : undefined}
			{...(exclusive !== undefined && !isRadio
				? { "data-on:change": exclusiveHandler(exclusive) }
				: {})}
		>
			<legend class="pz-field__label">{legend}</legend>
			<div class="pz-choices__list">
				{options.map((option, index) => (
					<label class="pz-choice">
						<input
							class="pz-choice__input"
							type={type}
							name={name}
							value={option.value}
							checked={checked.includes(option.value)}
							required={isRadio && required}
							{...(autofocus && index === 0 ? TAKE_FOCUS : {})}
						/>
						<span class={cx("pz-choice__mark", !isRadio && "pz-choice__mark--box")}>
							<CheckIcon />
						</span>
						<span>{option.label}</span>
					</label>
				))}
			</div>
			{error !== undefined ? (
				<p class="pz-field__error" id={errorId}>
					{error}
				</p>
			) : null}
		</fieldset>
	);
}
