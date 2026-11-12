/**
 * Where to land after signing in through the directory: a control-plane page the person was sent
 * to (a site's `/admin` → `/admin/platform?brand=…`), remembered for ten minutes in a cookie the
 * proxy sets. Only `/admin/platform…` paths of printable ASCII are honoured (no open redirect).
 */
export const RETURN_COOKIE = "psi-cms-return";
export const RETURN_MAX_AGE = 600;
const SAFE = /^\/admin\/platform(?:\/[a-z]+)?(?:\?[A-Za-z0-9=&_%.-]*)?$/;

export function safeReturnTo(raw: string | null | undefined): string | null {
	if (raw === null || raw === undefined) return null;
	let path: string;
	try {
		path = decodeURIComponent(raw);
	} catch {
		return null;
	}
	return SAFE.test(path) ? path : null;
}

/** The remembered page from a Cookie header, if any and safe. */
export function returnToFrom(cookieHeader: string | null): string | null {
	const hit = (cookieHeader ?? "")
		.split(";")
		.map((c) => c.trim())
		.find((c) => c.startsWith(`${RETURN_COOKIE}=`));
	return safeReturnTo(hit?.slice(RETURN_COOKIE.length + 1));
}
