import { z } from "zod";

/**
 * What a booking request asks of a person, in one place: the booking form, the chat and the store
 * all use these rules, so what one accepts the others accept. The messages are codes the sites
 * translate; a typo'd e-mail domain carries the domain it probably meant.
 */
export const FIELD_LIMITS = {
	nameMin: 2,
	nameMax: 100,
	ageMin: 0,
	ageMax: 120,
	detailsMin: 10,
	detailsMax: 2000,
	emailMax: 120,
} as const;

/** Letters of any script (diacritics included), spaces, hyphens and apostrophes; starts with a letter. */
const NAME = /^\p{L}[\p{L}\p{M} '’-]*$/u;

const squash = (value: string): string => value.replace(/\s+/g, " ").trim();

export const NameSchema = z
	.string()
	.transform(squash)
	.pipe(
		z
			.string()
			.min(FIELD_LIMITS.nameMin, { message: "name" })
			.max(FIELD_LIMITS.nameMax, { message: "name" })
			.regex(NAME, { message: "name" }),
	);

/** Whole years, 0 to 120, from a form's text. */
export const AgeSchema = z
	.string()
	.trim()
	.regex(/^\d{1,3}$/, { message: "age" })
	.transform(Number)
	.pipe(
		z
			.number()
			.int()
			.min(FIELD_LIMITS.ageMin, { message: "age" })
			.max(FIELD_LIMITS.ageMax, { message: "age" }),
	);

export const DetailsSchema = z
	.string()
	.transform((value) => value.replace(/\r\n?/g, "\n").trim())
	.pipe(
		z
			.string()
			.min(FIELD_LIMITS.detailsMin, { message: "details" })
			.max(FIELD_LIMITS.detailsMax, { message: "details" }),
	);

/** The phone as E.164 (`+40722123456`), or undefined when it is none of the accepted shapes. */
export function normalisePhone(raw: string): string | undefined {
	const kept = raw.trim().replace(/[\s().-]/g, "");
	if (!/^\+?\d+$/.test(kept)) return undefined;
	const international = kept.startsWith("00") ? `+${kept.slice(2)}` : kept;
	if (international.startsWith("+")) {
		if (!/^\+[1-9]\d{7,14}$/.test(international)) return undefined;
		return international.startsWith("+40") && international.length !== 12
			? undefined
			: international;
	}
	// A Romanian national number: 07xx (mobile) or 02x/03x (landline), ten digits.
	return /^0[237]\d{8}$/.test(international) ? `+40${international.slice(1)}` : undefined;
}

export const PhoneSchema = z.string().transform((value, ctx) => {
	const phone = normalisePhone(value);
	if (phone === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "phone" });
	return phone ?? "";
});

/** Common misspellings of the big mail domains, and what was meant. */
const DOMAIN_TYPOS: Readonly<Record<string, string>> = {
	"gmial.com": "gmail.com",
	"gmai.com": "gmail.com",
	"gmail.con": "gmail.com",
	"gmail.co": "gmail.com",
	"gmail.cm": "gmail.com",
	"gnail.com": "gmail.com",
	"gamil.com": "gmail.com",
	"gmaill.com": "gmail.com",
	"yahooo.com": "yahoo.com",
	"yaho.com": "yahoo.com",
	"yahoo.con": "yahoo.com",
	"yahoo.co": "yahoo.com",
	"hotmial.com": "hotmail.com",
	"hotmai.com": "hotmail.com",
	"hotmail.con": "hotmail.com",
	"outlok.com": "outlook.com",
	"outloook.com": "outlook.com",
	"outlook.con": "outlook.com",
	"icloud.con": "icloud.com",
};

/** The domain an e-mail's probable typo was meant to be, or undefined. */
export function emailSuggestion(email: string): string | undefined {
	return DOMAIN_TYPOS[email.slice(email.lastIndexOf("@") + 1).toLowerCase()];
}

export const EmailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.max(FIELD_LIMITS.emailMax, { message: "email" })
	.regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, { message: "email" })
	.superRefine((email, ctx) => {
		const meant = emailSuggestion(email);
		if (meant !== undefined)
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: `typo:${meant}` });
	});
