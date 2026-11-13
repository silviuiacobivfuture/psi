import type { FormDefinition, FormField } from "@psi/scheduling/clinic";

type Body = Readonly<Record<string, string | File | ReadonlyArray<string | File>>>;

const texts = (body: Body, name: string): string[] => {
	const v = body[name];
	if (v === undefined) return [];
	return (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string");
};
const text = (body: Body, name: string): string => texts(body, name)[0] ?? "";

const num = (raw: string): number | undefined => {
	const t = raw.trim().replace(",", ".");
	if (t === "") return undefined;
	const n = Number(t);
	return Number.isFinite(n) ? n : undefined;
};

/** The form field name of a table cell: `f.<field>.<row>.<column>`. */
export const cellName = (field: string, row: number, column: string): string =>
	`f.${field}.${row}.${column}`;

function tableRows(field: FormField, body: Body): Array<Record<string, unknown>> {
	const columns = field.columns ?? [];
	const rows = new Set<number>();
	const prefix = `f.${field.key}.`;
	for (const name of Object.keys(body)) {
		if (!name.startsWith(prefix)) continue;
		const index = Number(name.slice(prefix.length).split(".")[0]);
		if (Number.isInteger(index) && index >= 0) rows.add(index);
	}
	const out: Array<Record<string, unknown>> = [];
	for (const i of [...rows].sort((a, b) => a - b)) {
		const row: Record<string, unknown> = {};
		for (const c of columns) {
			const raw = text(body, cellName(field.key, i, c.key));
			if (raw.trim() === "") continue;
			if (c.type === "number") {
				const n = num(raw);
				if (n !== undefined) row[c.key] = n;
			} else row[c.key] = raw;
		}
		// A row left entirely blank is not a row.
		if (Object.keys(row).length > 0) out.push(row);
	}
	return out;
}

/** What a field's form inputs say, or undefined when it was left empty (an empty field is absent, never "" or NaN). */
function fieldValue(field: FormField, body: Body): unknown {
	const name = `f.${field.key}`;
	switch (field.type) {
		case "text":
		case "longtext":
		case "date":
		case "choice":
		case "file": {
			const v = text(body, name).trim();
			return v === "" ? undefined : v;
		}
		case "number":
		case "money":
		case "rating":
			return num(text(body, name));
		case "yesno":
			return text(body, `${name}`) === "" ? undefined : text(body, name) === "yes";
		case "multichoice": {
			// A field without listed options is a textarea, one choice per line.
			const v = texts(body, name)
				.flatMap((t) => t.split("\n"))
				.map((t) => t.trim())
				.filter((t) => t !== "");
			return v.length === 0 ? undefined : v;
		}
		case "table": {
			const rows = tableRows(field, body);
			return rows.length === 0 ? undefined : rows;
		}
		default: {
			const never: never = field.type;
			return never;
		}
	}
}

/** The record's values from a posted form of the definition: only what was filled in, typed as the definition says. */
export function formToData(def: FormDefinition, body: Body): Record<string, unknown> {
	const data: Record<string, unknown> = {};
	for (const f of def.fields) {
		const v = fieldValue(f, body);
		if (v !== undefined) data[f.key] = v;
	}
	return data;
}
