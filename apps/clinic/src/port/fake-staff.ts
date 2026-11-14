import type { FakeTeam } from "./fake-members";
import type { ClinicPort } from "./port";
import { PortError } from "./port";
import type { AppSlug } from "./schema";
import { InviteInputSchema, StaffQuerySchema } from "./schema-members";
import type { AppData } from "./seed";

/** An account of the fake sign-in: the staff group's people, and clients' accounts the search must never offer. */
export interface FakeAccount {
	subject: string;
	displayName: string;
	email: string;
	active?: boolean;
	/** Has signed in at least once: no new set-password link is made for them. */
	signedIn?: boolean;
	/** A client's account (the customers group), never staff. */
	customer?: boolean;
}

export interface StaffDeps {
	team: FakeTeam;
	self: string;
	accounts: FakeAccount[];
	data: (app: AppSlug) => AppData;
	guard: (method: keyof ClinicPort) => void;
	log: (d: AppData, actor: string, action: string, target: string) => void;
}

/** The sign-in keeps one set-password link per person for 30 minutes and answers that same one meanwhile. */
const LINK_MS = 30 * 60_000;
const linkOf = (subject: string): string => `https://sso.example.test/recovery/${subject}`;

/** The add-member search and the invitation over a fake sign-in, with the service's refusals. */
export function createFakeStaff(
	deps: StaffDeps,
): Pick<ClinicPort, "searchStaff" | "inviteMember" | "newSignInLink"> {
	const { accounts, team, guard, data, log } = deps;
	let n = 0;
	const inTeam = (app: AppSlug, subject: string): boolean => team.get(app)?.has(subject) === true;
	return {
		async searchStaff(app, query) {
			guard("searchStaff");
			const q = StaffQuerySchema.safeParse(query);
			if (!q.success) return [];
			const needle = q.data.toLowerCase();
			return accounts
				.filter((a) => a.customer !== true)
				.filter(
					(a) =>
						a.displayName.toLowerCase().includes(needle) || a.email.toLowerCase().includes(needle),
				)
				.slice(0, 20)
				.map((a) => ({
					subject: a.subject,
					displayName: a.displayName,
					email: a.email,
					active: a.active !== false,
					member: inTeam(app, a.subject),
				}));
		},
		async inviteMember(app, raw) {
			guard("inviteMember");
			const input = InviteInputSchema.safeParse(raw);
			if (!input.success) throw new PortError("invalid", "invite");
			const d = data(app);
			if (!input.data.roles.every((r) => d.roles.some((x) => x.id === r)))
				throw new PortError("invalid", "roles");
			const email = input.data.email.toLowerCase();
			const found = accounts.find((a) => a.email.toLowerCase() === email);
			if (found?.customer === true)
				throw new PortError("conflict", "customer", [], "customer_account");
			if (found !== undefined && found.active === false)
				throw new PortError("conflict", "disabled", [], "account_disabled");
			if (found?.subject === deps.self) throw new PortError("forbidden", "self", [], "self");
			if (found !== undefined && inTeam(app, found.subject))
				throw new PortError("conflict", "member", [], "already_member");
			n += 1;
			const account: FakeAccount = found ?? {
				subject: `invited-${n}`,
				displayName: input.data.displayName,
				email,
			};
			if (found === undefined) accounts.push(account);
			const people = team.get(app) ?? new Map();
			team.set(app, people);
			people.set(account.subject, {
				displayName: input.data.displayName,
				email,
				roles: [...new Set(input.data.roles)],
				coordinates: [...new Set(input.data.coordinates)],
				grants: [],
				denies: [],
				calendars: [],
			});
			log(d, "console", "member.invite", `members:${account.subject}`);
			return {
				subject: account.subject,
				displayName: input.data.displayName,
				account: found === undefined ? "created" : "existing",
				signInLink: found === undefined ? linkOf(account.subject) : null,
				signInLinkExpiresBy: found === undefined ? Date.now() + LINK_MS : null,
			};
		},
		async newSignInLink(app, subject) {
			guard("newSignInLink");
			if (subject === deps.self) throw new PortError("forbidden", "self", [], "self");
			const member = team.get(app)?.get(subject);
			if (member === undefined) throw new PortError("not-found", subject);
			if (member.email === undefined) throw new PortError("conflict", "email", [], "no_email");
			const account = accounts.find(
				(a) => a.subject === subject && a.email.toLowerCase() === member.email?.toLowerCase(),
			);
			if (account === undefined || account.customer === true)
				throw new PortError("conflict", "account", [], "no_account");
			if (account.active === false)
				throw new PortError("conflict", "disabled", [], "account_disabled");
			if (account.signedIn === true)
				throw new PortError("conflict", "signed in", [], "already_signed_in");
			log(data(app), "console", "member.link", `members:${subject}`);
			// As the estate's sign-in does: the same link for its 30 minutes.
			return { link: linkOf(subject), expiresBy: Date.now() + LINK_MS };
		},
	};
}
