import type { FieldType, FormField, TableColumn } from "../forms";

/** Terse field constructors for the seeded templates. Every seeded field is clinical and optional. */
function field(
	type: FieldType,
	key: string,
	ro: string,
	en: string,
	extra: Partial<FormField> = {},
): FormField {
	return {
		key,
		label: { ro, en },
		type,
		options: [],
		required: false,
		group: "clinical",
		...extra,
	};
}

export const f = {
	text: (key: string, ro: string, en: string): FormField => field("text", key, ro, en),
	longtext: (key: string, ro: string, en: string): FormField => field("longtext", key, ro, en),
	number: (key: string, ro: string, en: string): FormField => field("number", key, ro, en),
	date: (key: string, ro: string, en: string): FormField => field("date", key, ro, en),
	choice: (key: string, ro: string, en: string): FormField => field("choice", key, ro, en),
	multi: (key: string, ro: string, en: string): FormField => field("multichoice", key, ro, en),
	/** A choice whose options are learned from the data an import brings. */
	learned: (key: string, ro: string, en: string): FormField =>
		field("choice", key, ro, en, { learnOptions: true }),
	table: (key: string, ro: string, en: string, columns: ReadonlyArray<TableColumn>): FormField =>
		field("table", key, ro, en, { columns: [...columns] }),
	rating: (key: string, ro: string, en: string): FormField => field("rating", key, ro, en),
};

export const col = (
	key: string,
	ro: string,
	en: string,
	type: TableColumn["type"],
): TableColumn => ({ key, label: { ro, en }, type });
