import type { AccountLink } from "./plan-org";

const SUBJECT = /^[A-Za-z0-9][A-Za-z0-9._@-]{1,199}$/;

/** `<practitioner>=<subject>`, e.g. `Turcu Daniela=d40c…`: the practitioner as named on the team, then the account. */
export function parseLink(text: string): AccountLink {
	const at = text.lastIndexOf("=");
	const person = text.slice(0, at).trim();
	const subject = text.slice(at + 1).trim();
	if (at < 1 || person === "" || !SUBJECT.test(subject))
		throw new Error(`--link is "<practitioner>=<subject>": got "${text}"`);
	return { person, subject };
}
