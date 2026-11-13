import { emailKey, nameKey } from "../domain/clients";

/**
 * How a person is recognised across the booking paths: a phone as E.164, an e-mail lower-cased,
 * a name without case or diacritics. Pure. (`phoneKey` in `domain/clients` is the national-digits
 * key the duplicate finder stores; this is the international form a blacklist entry keeps.)
 */

/** Romanian national numbers have nine digits after the country code, the first one 2, 3, 7, 8 or 9. */
const RO_NATIONAL = /^[23789]\d{8}$/;
/** E.164: at most 15 digits, no leading zero. */
const INTERNATIONAL = /^[1-9]\d{7,14}$/;

/**
 * `+40748017752` for any of `0748 017 752`, `0748-017-752`, `+40 748 017 752`, `0040748017752`,
 * `40748017752`, `+40 (0)748 017 752`; another country's number with its `+` or `00` is kept as
 * E.164. Undefined when the text cannot be a phone number (letters, too short, a Romanian number
 * of the wrong length).
 */
export function normalizePhone(raw: string): string | undefined {
	const text = raw.trim();
	if (!/^[+\d][\d\s().-]*$/.test(text)) return undefined;
	const hasPlus = text.startsWith("+");
	let digits = text.replace(/\D/g, "");
	if (hasPlus) {
		// Nothing to strip: the country code is there.
	} else if (digits.startsWith("00")) {
		digits = digits.slice(2);
	} else if (digits.startsWith("0") && digits.length === 10) {
		digits = `40${digits.slice(1)}`;
	} else if (digits.length === 9 && /^[23789]/.test(digits)) {
		digits = `40${digits}`;
	} else if (!digits.startsWith("40")) {
		return undefined;
	}
	// "+40 (0)748 ...": the trunk zero written after the country code.
	if (digits.startsWith("400") && digits.length === 12) digits = `40${digits.slice(3)}`;
	if (digits.startsWith("40")) return RO_NATIONAL.test(digits.slice(2)) ? `+${digits}` : undefined;
	return INTERNATIONAL.test(digits) ? `+${digits}` : undefined;
}

/** The e-mail lower-cased and trimmed, or undefined when it cannot be one. */
export function normalizeEmail(raw: string): string | undefined {
	return emailKey(raw);
}

export { nameKey as normalizeName };

/** What can recognise a person at a booking path, as typed. */
export interface RawIdentifiers {
	phones?: ReadonlyArray<string | undefined>;
	emails?: ReadonlyArray<string | undefined>;
	name?: string;
}

/** The identifiers that normalise; the ones that do not are simply not identifiers. */
export function normalizedIdentifiers(raw: RawIdentifiers): {
	phones: ReadonlyArray<string>;
	emails: ReadonlyArray<string>;
} {
	const phones = new Set<string>();
	for (const p of raw.phones ?? []) {
		const n = p === undefined ? undefined : normalizePhone(p);
		if (n !== undefined) phones.add(n);
	}
	const emails = new Set<string>();
	for (const e of raw.emails ?? []) {
		const n = e === undefined ? undefined : normalizeEmail(e);
		if (n !== undefined) emails.add(n);
	}
	return { phones: [...phones].sort(), emails: [...emails].sort() };
}
