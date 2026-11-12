import { type NextRequest, NextResponse } from "next/server";
import { RETURN_COOKIE, RETURN_MAX_AGE, safeReturnTo } from "./platform/return-to";

/**
 * Arriving from a site's `/admin` (`…/admin/platform?brand=psizone`): the brand filter is set on
 * the way in, server-side, so it survives the sign-in round trip. Only a known brand is kept; the
 * filter is a preference, never a permission (every view asks the estate).
 */
const BRANDS = new Set(["psizone", "eqsync", "hemisync", "blog"]);
export const BRAND_COOKIE = "psi-cms-brand";

/**
 * The admin's language. Romanian unless the person chose otherwise (Account → Language, or
 * `?lng=en|ro` on any admin address): the browser's own language never decides, so an English
 * browser still gets the Romanian admin the team works in. Payload reads this cookie.
 */
export const LANG_COOKIE = "payload-lng";
const LANGS = new Set(["ro", "en"]);

export function proxy(request: NextRequest): NextResponse {
	const brand = request.nextUrl.searchParams.get("brand");
	const asked = request.nextUrl.searchParams.get("lng");
	const current = request.cookies.get(LANG_COOKIE)?.value;
	const lang =
		asked !== null && LANGS.has(asked)
			? asked
			: current !== undefined && LANGS.has(current)
				? current
				: "ro";
	// Set on the request too, so this very render is already in the chosen language.
	request.cookies.set(LANG_COOKIE, lang);
	const res = NextResponse.next({ request: { headers: request.headers } });
	if (current !== lang) {
		res.cookies.set(LANG_COOKIE, lang, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
	}
	if (brand !== null && BRANDS.has(brand) && request.cookies.get(BRAND_COOKIE)?.value !== brand) {
		res.cookies.set(BRAND_COOKIE, brand, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
	}
	// Remembered across the directory's sign-in, so the person lands where the site sent them.
	const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;
	if (safeReturnTo(path) !== null) {
		res.cookies.set(RETURN_COOKIE, path, {
			path: "/",
			maxAge: RETURN_MAX_AGE,
			sameSite: "lax",
			httpOnly: true,
		});
	}
	return res;
}

export const config = { matcher: ["/admin/:path*"] };
