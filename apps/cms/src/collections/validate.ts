import type { PayloadRequest } from "payload";
import { type Problem, say } from "../labels";
import { SLUG } from "./vocabulary";

/** Route segments the blog owns (its routes and feeds). */
const RESERVED = new Set([
	"pagina",
	"page",
	"subiect",
	"topic",
	"autori",
	"authors",
	"toate",
	"all",
	"rss.xml",
	"sitemap.xml",
]);

export function words(text: string): number {
	return text.split(/\s+/u).filter((w) => w.length > 0).length;
}

export function validSlug(value: unknown): true | Problem {
	if (typeof value !== "string" || value === "") return true;
	if (RESERVED.has(value)) return "slugReserved";
	return SLUG.test(value) ? true : "slug";
}

/** The blog's limit (@psi/content STANDFIRST_MAX_WORDS). */
export const STANDFIRST_MAX_WORDS = 60;

export function validStandfirst(value: unknown): true | Problem {
	return typeof value === "string" && words(value) > STANDFIRST_MAX_WORDS ? "standfirst" : true;
}

/** The blog's limits (@psi/content `Seo`): a title of at most 65 characters. */
export function validSeoTitle(value: unknown): true | Problem {
	return typeof value === "string" && value.length > 65 ? "seoTitle" : true;
}

/** The blog's limits (@psi/content `Seo`): a description of 70–170 characters. */
export function validSeoDescription(value: unknown): true | Problem {
	if (typeof value !== "string" || value === "") return true;
	return value.length >= 70 && value.length <= 170 ? true : "seoDescription";
}

export function validAnswer(value: unknown): true | Problem {
	if (typeof value !== "string" || value.trim() === "") return true;
	const n = words(value);
	return n >= 80 && n <= 250 ? true : "answerLength";
}

export function validCitePath(value: unknown): true | Problem {
	if (typeof value !== "string" || value === "") return true;
	return value.startsWith("/") && !value.startsWith("//") && !/\s/.test(value) ? true : "citePath";
}

/** Adapts a validator to Payload's `validate`: the required check first, then the message in the admin language. */
export function validator(
	fn: (value: unknown) => true | Problem,
	required = false,
): (value: unknown, options: { req: PayloadRequest }) => true | string {
	return (value, { req }) => {
		if (required && (value === null || value === undefined || value === "")) {
			return req.t("validation:required");
		}
		const r = fn(value);
		return r === true ? true : say(r, req.i18n.language);
	};
}
