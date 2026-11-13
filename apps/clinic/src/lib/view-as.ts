import type { Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { z } from "zod";
import type { ViewAsTarget } from "../port/port";
import type { AppSlug } from "../port/schema";

const COOKIE = "psi-clinic-view-as";
const Target = z.custom<ViewAsTarget>(
	(v) => typeof v === "string" && /^(role|member):[^\s:][^\s]{0,199}$/.test(v),
);
const State = z.object({
	subject: z.string(),
	app: z.string(),
	as: Target,
	label: z.string().max(120),
});
export type ViewAsState = z.infer<typeof State>;

/**
 * "Vezi ca…" lives in the session, never in the URL: a signed, HttpOnly cookie that ends with the browser session and
 * names the person and the app it was started for. It is only a request to look; the service decides every time.
 */
export async function readViewAs(
	c: Context,
	secret: string,
	subject: string,
	app: AppSlug,
): Promise<ViewAsState | null> {
	const raw = await getSignedCookie(c, secret, COOKIE);
	if (typeof raw !== "string") return null;
	try {
		const state = State.safeParse(JSON.parse(raw));
		return state.success && state.data.subject === subject && state.data.app === app
			? state.data
			: null;
	} catch {
		return null;
	}
}

export async function writeViewAs(
	c: Context,
	secret: string,
	state: ViewAsState,
	secure: boolean,
): Promise<void> {
	await setSignedCookie(c, COOKIE, JSON.stringify(state), secret, {
		path: "/",
		httpOnly: true,
		sameSite: "Lax",
		secure,
	});
}

export function clearViewAs(c: Context): void {
	deleteCookie(c, COOKIE, { path: "/" });
}
