import type { PayloadRequest } from "payload";

/**
 * Runs a Local API read that passes `req` (same transaction) without letting it change the
 * request's locale: Payload's operations write `req.locale` (and `req.fallbackLocale`), so a
 * `locale: "all"` read inside a save would turn the rest of that save into a write to locale
 * "all", and every localised field of it would be dropped.
 */
export async function keepingLocale<T>(req: PayloadRequest, read: () => Promise<T>): Promise<T> {
	const locale = req.locale;
	const fallbackLocale = req.fallbackLocale;
	try {
		return await read();
	} finally {
		req.locale = locale;
		req.fallbackLocale = fallbackLocale;
	}
}
