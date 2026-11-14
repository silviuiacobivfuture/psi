import { type Console, MEMBER, startConsole } from "./harness";

/** A console signed in as a member of psizone holding these roles (`volunteer`: a role the clinic does not have). */
export async function consoleAs(roles: string[]): Promise<Console> {
	const c = await startConsole(
		MEMBER,
		{ today: "2026-11-16" },
		{
			[MEMBER.sub]: [{ app: "psizone", roles }],
			colleague: [{ app: "psizone", roles: ["reception"] }],
		},
	);
	await c.signIn();
	return c;
}

export const FORM = { "content-type": "application/x-www-form-urlencoded" } as const;

/** Posts a form as a browser would (repeated names for a list), following the redirect. */
export const send = (
	c: Console,
	path: string,
	values: ReadonlyArray<[string, string]>,
): Promise<Response> => c.post(path, new URLSearchParams([...values]), FORM);

/** The markup of the form posting to `action` on a page. */
export function formHtml(html: string, action: string): string {
	const start = html.indexOf(`action="${action}"`);
	if (start < 0) throw new Error(`no form posts to ${action}`);
	const open = html.lastIndexOf("<form", start);
	const end = html.indexOf("</form>", start);
	return html.slice(open, end);
}

const attr = (tag: string, name: string): string | undefined => {
	const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
	return match?.[1]
		?.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
};

/**
 * What a browser would send for a form as it is shown: every named input (a checkbox or a radio only when ticked),
 * selects with their selected option, textareas with their text; no buttons (the caller adds the one pressed).
 */
export function fieldsOf(form: string): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	for (const match of form.matchAll(/<input\b[^>]*>/g)) {
		const tag = match[0];
		const name = attr(tag, "name");
		if (name === undefined) continue;
		const type = attr(tag, "type") ?? "text";
		if ((type === "checkbox" || type === "radio") && !/\schecked(=""|\s|>|\/)/.test(tag)) continue;
		out.push([name, attr(tag, "value") ?? (type === "checkbox" ? "on" : "")]);
	}
	for (const match of form.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
		const options = match[2] ?? "";
		const chosen =
			/<option[^>]*value="([^"]*)"[^>]*selected/.exec(options) ??
			/<option[^>]*value="([^"]*)"/.exec(options);
		out.push([match[1] ?? "", chosen?.[1] ?? ""]);
	}
	for (const match of form.matchAll(/<textarea\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g))
		out.push([match[1] ?? "", (match[2] ?? "").replace(/&amp;/g, "&")]);
	return out;
}

/** The fields with some replaced (by name) and some added. */
export function withFields(
	fields: ReadonlyArray<[string, string]>,
	changes: Readonly<Record<string, string | null>>,
): Array<[string, string]> {
	const kept = fields.filter(([k]) => !Object.hasOwn(changes, k));
	const added = Object.entries(changes).flatMap(([k, v]) =>
		v === null ? [] : [[k, v] as [string, string]],
	);
	return [...kept, ...added];
}

/** What a person reads of a page: no tags, entities decoded. */
export const textOf = (html: string): string =>
	html
		.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
		.replace(/<[^>]*>/g, " ")
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ");

/** The markup of one interval row of the rules editor. */
export function rowHtml(html: string, key: string): string {
	const start = html.indexOf(`data-row="${key}"`);
	if (start < 0) throw new Error(`no row ${key}`);
	const next = html.indexOf('data-row="', start + 10);
	const day = html.indexOf("av-day__add", start);
	const ends = [next, day].filter((i) => i > 0);
	return html.slice(start, ends.length === 0 ? undefined : Math.min(...ends));
}
