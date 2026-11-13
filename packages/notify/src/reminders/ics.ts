/** RFC 5545 text escaping. */
function escapeText(text: string): string {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/;/g, ";")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets are folded with CRLF + space. */
function fold(line: string): string {
	const bytes = Buffer.from(line, "utf8");
	if (bytes.length <= 75) return line;
	const out: string[] = [];
	let start = 0;
	let limit = 75;
	while (start < bytes.length) {
		let end = Math.min(start + limit, bytes.length);
		while (end < bytes.length && ((bytes[end] ?? 0) & 0xc0) === 0x80) end--;
		out.push(bytes.subarray(start, end).toString("utf8"));
		start = end;
		limit = 74;
	}
	return out.join("\r\n ");
}

const stamp = (ms: number): string =>
	new Date(ms)
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");

export interface IcsEvent {
	uid: string;
	summary: string;
	startsAt: number;
	endsAt: number;
	location: string;
	url?: string;
	now: number;
	/** Set for a cancelled appointment, so a calendar removes it. */
	cancelled?: boolean;
}

export function renderIcs(e: IcsEvent): string {
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//psi//notify//EN",
		"CALSCALE:GREGORIAN",
		`METHOD:${e.cancelled === true ? "CANCEL" : "PUBLISH"}`,
		"BEGIN:VEVENT",
		`UID:${e.uid}`,
		`DTSTAMP:${stamp(e.now)}`,
		`DTSTART:${stamp(e.startsAt)}`,
		`DTEND:${stamp(e.endsAt)}`,
		`SUMMARY:${escapeText(e.summary)}`,
		`LOCATION:${escapeText(e.location)}`,
		...(e.url === undefined ? [] : [`URL:${e.url}`]),
		`STATUS:${e.cancelled === true ? "CANCELLED" : "CONFIRMED"}`,
		"END:VEVENT",
		"END:VCALENDAR",
	];
	return `${lines.map(fold).join("\r\n")}\r\n`;
}
