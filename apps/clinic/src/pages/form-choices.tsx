import type { JSX } from "hono/jsx/jsx-runtime";

/** One checkbox with its label: sent as `name=value` when ticked. */
export function Check({
	name,
	value,
	label,
	on,
}: {
	name: string;
	value?: string;
	label: string;
	on: boolean;
}): JSX.Element {
	return (
		<label class="adm-check">
			<input type="checkbox" name={name} value={value ?? "on"} checked={on} />
			{label}
		</label>
	);
}

/** A list of checkboxes under one legend, each sending its id: nothing when there is nothing to choose. */
export function Pick({
	legend,
	name,
	items,
	on,
}: {
	legend: string;
	name: string;
	items: ReadonlyArray<{ id: string; name: string }>;
	on: ReadonlyArray<string>;
}): JSX.Element | null {
	if (items.length === 0) return null;
	return (
		<fieldset class="cl-choices">
			<legend>{legend}</legend>
			{items.map((i) => (
				<Check key={i.id} name={name} value={i.id} label={i.name} on={on.includes(i.id)} />
			))}
		</fieldset>
	);
}
