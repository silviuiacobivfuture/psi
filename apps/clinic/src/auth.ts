import type { Account } from "@psi/account";
import type { Context } from "hono";

export interface Person {
	subject: string;
	name: string;
	email: string | null;
}

/** What the console needs from sign-in: who is asking, where to send them, how they leave. */
export interface Auth {
	person(c: Context): Promise<Person | null>;
	/** The person's token for calling the scheduling service AS them; null when there is none (signed out, or the fake). */
	bearer(c: Context): Promise<string | null>;
	signInHref(returnTo: string): string;
	readonly signOutAction: string;
	/**
	 * The browsers this person is signed in on. The estate's sign-in keeps no list across browsers: it knows this one
	 * (and ends every one on "sign out everywhere"), so that is what it answers.
	 */
	sessions(c: Context): Promise<ReadonlyArray<SessionInfo>>;
}

export interface SessionInfo {
	/** The browser's own User-Agent, to be said briefly ("Chrome pe Linux"). */
	userAgent: string | undefined;
	/** This is the browser asking. */
	current: boolean;
	/** When it was last seen (ISO), if the store says. */
	lastSeen: string | null;
}

/** The estate's sign-in (Authentik, OIDC) through @psi/account. */
export function accountAuth(account: Account): Auth {
	return {
		async person(c) {
			const p = await account.person(c);
			return p === null
				? null
				: { subject: p.subject, name: p.name ?? p.email ?? p.subject, email: p.email };
		},
		bearer: (c) => account.idToken(c),
		signInHref: (returnTo) => account.signInHref(returnTo),
		signOutAction: account.signOutAction,
		sessions: async (c) => [
			{ userAgent: c.req.header("user-agent"), current: true, lastSeen: null },
		],
	};
}

export const DEV_SUBJECT = "dev-demo-0001";

/** DEV ONLY (CLINIC_DEV_SIGNIN): a fixed, clearly fake person. `readEnv` refuses this in production. */
export function devAuth(): Auth {
	const demo: Person = {
		subject: DEV_SUBJECT,
		name: "Demo Proprietar",
		email: "proprietar.demo@example.test",
	};
	return {
		person: async () => demo,
		bearer: async () => null,
		signInHref: () => "/",
		signOutAction: "/dev-signout",
		sessions: async (c) => [
			{ userAgent: c.req.header("user-agent"), current: true, lastSeen: null },
			{
				userAgent:
					"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1",
				current: false,
				lastSeen: new Date(Date.now() - 3 * 3_600_000).toISOString(),
			},
		],
	};
}
