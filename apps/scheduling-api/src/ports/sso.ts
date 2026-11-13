/**
 * The estate's sign-in, as the invitation flow needs it. The service creates a person in the customers group so a
 * client can reach the sites' account pages; it never sees or keeps a password. The live adapter speaks Authentik's
 * admin API (`sso-authentik.ts`); the fake keeps accounts in memory for tests and the local run.
 */
export interface SsoAccount {
	/** The provider's own id for the user (what its admin API takes). */
	userId: string;
	/** The `sub` a site's token carries for this user: what the account link is keyed on. */
	subject: string;
	email: string;
	active: boolean;
}

export class SsoUnavailable extends Error {
	override readonly name = "SsoUnavailable";
}

export interface SsoPort {
	/** The account with this e-mail address (any group), or undefined. Never creates. */
	findByEmail(email: string): Promise<SsoAccount | undefined>;
	/** A new active account in the customers group. Throws `SsoUnavailable` when the provider cannot be reached. */
	create(input: { email: string; name: string }): Promise<SsoAccount>;
	/** A one-time link on which the person sets a password; for an account this service created. */
	recoveryLink(userId: string): Promise<string>;
	/** Switches an account off (reversible; nothing is deleted). */
	deactivate(userId: string): Promise<void>;
	/** When the account last signed in (UTC ms), or undefined if it never has: how an invitation is seen to have been used. */
	lastLogin(userId: string): Promise<number | undefined>;
}

export interface FakeSso extends SsoPort {
	accounts: Map<string, SsoAccount>;
	/** Every call, in order, for tests that assert what the provider was and was not asked. */
	calls: string[];
	/** Make the next calls fail as an unreachable provider. */
	failing: boolean;
	/** An account that existed before any invitation (self-registered, or a member of staff). */
	seed(email: string, options?: { active?: boolean }): SsoAccount;
	/** The account behind this address signed in at `at`. */
	signIn(email: string, at: number): void;
}

/** An in-memory provider: deterministic ids and subjects (`sub-<n>`), links on `https://sso.test`. */
export function createFakeSso(): FakeSso {
	const accounts = new Map<string, SsoAccount>();
	const logins = new Map<string, number>();
	let n = 0;
	const unreachable = (self: FakeSso): void => {
		if (self.failing) throw new SsoUnavailable("the sign-in is not reachable");
	};
	const make = (email: string, active: boolean): SsoAccount => {
		n += 1;
		const account = { userId: `u${n}`, subject: `sub-${n}`, email, active };
		accounts.set(email, account);
		return account;
	};
	const self: FakeSso = {
		accounts,
		calls: [],
		failing: false,
		seed: (email, options) => make(email, options?.active ?? true),
		signIn(email, at) {
			const account = accounts.get(email);
			if (account !== undefined) logins.set(account.userId, at);
		},
		lastLogin(userId) {
			self.calls.push(`lastLogin:${userId}`);
			unreachable(self);
			return Promise.resolve(logins.get(userId));
		},
		findByEmail(email) {
			self.calls.push(`find:${email}`);
			unreachable(self);
			return Promise.resolve(accounts.get(email));
		},
		create(input) {
			self.calls.push(`create:${input.email}`);
			unreachable(self);
			return Promise.resolve(make(input.email, true));
		},
		recoveryLink(userId) {
			self.calls.push(`recovery:${userId}`);
			unreachable(self);
			return Promise.resolve(`https://sso.test/recover/${userId}`);
		},
		deactivate(userId) {
			self.calls.push(`deactivate:${userId}`);
			unreachable(self);
			for (const account of accounts.values())
				if (account.userId === userId) account.active = false;
			return Promise.resolve();
		},
	};
	return self;
}
