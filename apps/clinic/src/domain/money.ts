/**
 * Money is integer bani (1 leu = 100 bani). Typed amounts are parsed from what a person types:
 * "1350", "1350,50", "1.350,50", "1350.5", "1 350,5 lei" — never through floating point.
 */
export function parseMoney(input: string): number | null {
	const cleaned = input.replace(/\s|lei|ron/gi, "").replace(/[  ]/g, "");
	if (cleaned === "" || !/^\d[\d.,]*$/.test(cleaned)) return null;
	const lastSep = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
	const tail = lastSep < 0 ? "" : cleaned.slice(lastSep + 1);
	// A separator followed by one or two digits is the decimal point; followed by three it groups thousands.
	const decimal = lastSep >= 0 && tail.length > 0 && tail.length <= 2;
	const whole = (decimal ? cleaned.slice(0, lastSep) : cleaned).replace(/[.,]/g, "");
	if (whole === "" || !/^\d+$/.test(whole)) return null;
	const frac = decimal ? tail.padEnd(2, "0") : "00";
	const bani = BigInt(whole) * 100n + BigInt(frac);
	return bani > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(bani);
}

export function formatMoney(bani: number, locale: "ro" | "en"): string {
	return new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		style: "currency",
		currency: "RON",
	}).format(bani / 100);
}

/** What a field shows when it is filled from a stored amount: plain decimals, comma in Romanian. */
export function moneyInput(bani: number, locale: "ro" | "en"): string {
	const whole = Math.trunc(bani / 100);
	const cents = String(bani % 100).padStart(2, "0");
	return `${whole}${locale === "ro" ? "," : "."}${cents}`;
}
