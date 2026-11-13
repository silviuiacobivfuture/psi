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
	signInHref(returnTo: string): string;
	readonly signOutAction: string;
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
		signInHref: (returnTo) => account.signInHref(returnTo),
		signOutAction: account.signOutAction,
	};
}

export const DEV_SUBJECT = "dev-demo-0001";

/** DEV ONLY (CLINIC_DEV_SIGNIN): a fixed, clearly fake person. `readEnv` refuses this in production. */
export function devAuth(): Auth {
	const demo: Person = {
		subject: DEV_SUBJECT,
		name: "Recepție Demo",
		email: "recepție.demo@example.test",
	};
	return { person: async () => demo, signInHref: () => "/", signOutAction: "/dev-signout" };
}
