import { sameOrigin } from "@psi/account";
import type { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { Auth, Person } from "./auth";
import { Layout } from "./layout";
import { viewerPrefs } from "./lib/context";
import { at } from "./lib/i18n";
import { m } from "./paraglide/messages.js";

const COOKIE = "psi-clinic-dev-subject";
const People = z.record(z.string(), z.string());
const Minted = z.object({ token: z.string().min(1) });

export interface DevApiSignIn {
	auth: Auth;
	mount(app: Hono): void;
}

/**
 * DEVELOPMENT ONLY (CLINIC_DEV_SIGNIN with the real service): sign in as anyone the local scheduling-api knows, through
 * its `/dev/token`. The server refuses to start with this and NODE_ENV=production (env.ts), so it cannot exist there.
 */
export function devApiSignIn(apiUrl: string, origin: string): DevApiSignIn {
	const base = apiUrl.replace(/\/+$/, "");
	const tokens = new Map<string, { token: string; expires: number }>();
	const subjectOf = (c: Parameters<Auth["person"]>[0]): string | undefined => {
		const v = getCookie(c, COOKIE);
		return v === undefined || !/^[a-z][a-z0-9-]{1,40}$/.test(v) ? undefined : v;
	};
	const auth: Auth = {
		async person(c): Promise<Person | null> {
			const subject = subjectOf(c);
			return subject === undefined ? null : { subject, name: subject, email: null };
		},
		async bearer(c) {
			const subject = subjectOf(c);
			if (subject === undefined) return null;
			const held = tokens.get(subject);
			if (held !== undefined && held.expires > Date.now()) return held.token;
			const res = await fetch(`${base}/dev/token`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ subject }),
			});
			if (!res.ok) return null;
			const minted = Minted.safeParse(await res.json().catch(() => undefined));
			if (!minted.success) return null;
			tokens.set(subject, { token: minted.data.token, expires: Date.now() + 50 * 60_000 });
			return minted.data.token;
		},
		signInHref: () => "/dev/signin",
		signOutAction: "/dev/signout",
	};
	return {
		auth,
		mount(app) {
			app.get("/dev/signin", async (c) => {
				const { locale, theme } = viewerPrefs(c);
				const o = at(locale);
				const got = await fetch(`${base}/dev/people`)
					.then((r) => r.json())
					.catch(() => ({}));
				const people = People.safeParse(got);
				return c.html(
					<Layout
						locale={locale}
						theme={theme}
						title={`${m.dev_signin_title({}, o)} · ${m.brand({}, o)}`}
					>
						<main class="adm gate">
							<section class="gate__card adm-card">
								<h1 class="adm-h1">{m.dev_signin_title({}, o)}</h1>
								<p class="adm-muted">{m.dev_signin_text({}, o)}</p>
								{people.success ? (
									Object.entries(people.data).map(([subject, role]) => (
										<form key={subject} method="post" action="/dev/as" class="adm-row">
											<input type="hidden" name="subject" value={subject} />
											<button class="adm-btn" type="submit" data-person={subject}>
												{subject} · {role}
											</button>
										</form>
									))
								) : (
									<p role="alert">{m.dev_signin_unreachable({}, o)}</p>
								)}
							</section>
						</main>
					</Layout>,
					200,
					{ "cache-control": "no-store" },
				);
			});
			app.post("/dev/as", async (c) => {
				if (!sameOrigin(c.req.raw.headers, c.req.method, origin)) return c.text("forbidden", 403);
				const form = await c.req.parseBody();
				const subject = typeof form.subject === "string" ? form.subject : "";
				if (!/^[a-z][a-z0-9-]{1,40}$/.test(subject)) return c.text("invalid", 400);
				setCookie(c, COOKIE, subject, { path: "/", httpOnly: true, sameSite: "Lax" });
				return c.redirect("/calendar", 303);
			});
			app.post("/dev/signout", (c) => {
				if (!sameOrigin(c.req.raw.headers, c.req.method, origin)) return c.text("forbidden", 403);
				deleteCookie(c, COOKIE, { path: "/" });
				return c.redirect("/dev/signin", 303);
			});
		},
	};
}
