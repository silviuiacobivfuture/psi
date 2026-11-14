import { type SsoAccount, SsoUnavailable } from "./sso";

/**
 * The estate's sign-in, as adding a member of the team needs it: people of the staff group found by name or e-mail, and
 * a new account made in that group for someone invited by e-mail. Customers (the clients' accounts) are never offered
 * and never turned into staff here. The live adapter speaks Authentik (`staff-authentik.ts`); the fake keeps accounts in
 * memory for tests and the local run.
 */
export interface StaffAccount extends SsoAccount {
	name: string;
	/** In the staff group: may reach the console. */
	staff: boolean;
	/** In the customers group: a client's account. */
	customer: boolean;
}

export interface StaffDirectory {
	/** People of the staff group whose name, username or e-mail match; at most `limit`. Never a customer-only account. */
	search(query: string, limit: number): Promise<StaffAccount[]>;
	/** The account with this e-mail address, in whatever group, or undefined. Never creates. */
	find(email: string): Promise<StaffAccount | undefined>;
	/** A new account in the staff group: active, with no password until the person sets one. */
	create(input: { email: string; name: string }): Promise<StaffAccount>;
	/** Puts an existing account (neither staff nor customer) into the staff group. */
	join(userId: string): Promise<void>;
	/** Takes an account out of the staff group again (the undo of `join`). */
	leave(userId: string): Promise<void>;
	/** When the account last signed in (UTC ms), or undefined if it never has. */
	lastLogin(userId: string): Promise<number | undefined>;
	/** A one-time link on which the person sets a password (short-lived; the sign-in's own setting). */
	recoveryLink(userId: string): Promise<string>;
	/** Switches an account off (reversible; nothing is deleted). */
	deactivate(userId: string): Promise<void>;
}

export interface FakeStaffDirectory extends StaffDirectory {
	accounts: Map<string, StaffAccount>;
	/** Every call, in order, for tests that assert what the provider was and was not asked. */
	calls: string[];
	/** Make the next calls fail as an unreachable provider. */
	failing: boolean;
	/** An account that exists before anything here (staff by default). */
	seed(
		email: string,
		name: string,
		options?: { staff?: boolean; customer?: boolean; active?: boolean; subject?: string },
	): StaffAccount;
	/** The account behind this address signed in at `at`. */
	signIn(email: string, at: number): void;
}

/** In memory: deterministic ids and subjects (`staff-sub-<n>`), links on `https://sso.test`. */
export function createFakeStaffDirectory(): FakeStaffDirectory {
	const accounts = new Map<string, StaffAccount>();
	const logins = new Map<string, number>();
	let n = 0;
	const make = (
		email: string,
		name: string,
		flags: { staff: boolean; customer: boolean; active: boolean },
		subject?: string,
	): StaffAccount => {
		n += 1;
		const account: StaffAccount = {
			userId: `su${n}`,
			subject: subject ?? `staff-sub-${n}`,
			email,
			name,
			...flags,
		};
		accounts.set(email.toLowerCase(), account);
		return account;
	};
	const self: FakeStaffDirectory = {
		accounts,
		calls: [],
		failing: false,
		seed: (email, name, o) =>
			make(
				email,
				name,
				{
					staff: o?.staff ?? true,
					customer: o?.customer ?? false,
					active: o?.active ?? true,
				},
				o?.subject,
			),
		search(query, limit) {
			self.calls.push(`search:${query}`);
			if (self.failing) return Promise.reject(new SsoUnavailable("the sign-in is not reachable"));
			const q = query.toLowerCase();
			return Promise.resolve(
				[...accounts.values()]
					.filter((a) => a.staff)
					.filter((a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
					.slice(0, limit),
			);
		},
		find(email) {
			self.calls.push(`find:${email}`);
			if (self.failing) return Promise.reject(new SsoUnavailable("the sign-in is not reachable"));
			return Promise.resolve(accounts.get(email.toLowerCase()));
		},
		create(input) {
			self.calls.push(`create:${input.email}`);
			if (self.failing) return Promise.reject(new SsoUnavailable("the sign-in is not reachable"));
			return Promise.resolve(
				make(input.email, input.name, { staff: true, customer: false, active: true }),
			);
		},
		join(userId) {
			self.calls.push(`join:${userId}`);
			if (self.failing) return Promise.reject(new SsoUnavailable("the sign-in is not reachable"));
			for (const a of accounts.values()) if (a.userId === userId) a.staff = true;
			return Promise.resolve();
		},
		signIn(email, at) {
			const account = accounts.get(email.toLowerCase());
			if (account !== undefined) logins.set(account.userId, at);
		},
		leave(userId) {
			self.calls.push(`leave:${userId}`);
			if (self.failing) return Promise.reject(new SsoUnavailable("the sign-in is not reachable"));
			for (const a of accounts.values()) if (a.userId === userId) a.staff = false;
			return Promise.resolve();
		},
		lastLogin(userId) {
			self.calls.push(`lastLogin:${userId}`);
			if (self.failing) return Promise.reject(new SsoUnavailable("the sign-in is not reachable"));
			return Promise.resolve(logins.get(userId));
		},
		recoveryLink(userId) {
			self.calls.push(`recovery:${userId}`);
			if (self.failing) return Promise.reject(new SsoUnavailable("the sign-in is not reachable"));
			return Promise.resolve(`https://sso.test/recover/${userId}`);
		},
		deactivate(userId) {
			self.calls.push(`deactivate:${userId}`);
			if (self.failing) return Promise.reject(new SsoUnavailable("the sign-in is not reachable"));
			for (const a of accounts.values()) if (a.userId === userId) a.active = false;
			return Promise.resolve();
		},
	};
	return self;
}
