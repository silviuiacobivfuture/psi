import { type Account, exportAccount, type ReservationsPort } from "@psi/account";
import type { AccountHit, ControlPorts, PersonView } from "@psi/cms-client";

/**
 * The privacy officer's side of the account database, on the person's behalf: find by e-mail, see
 * consents, saved articles and reservations (no conversation text, no contact details), export
 * everything as the person's own export would, and erase as the person's own erasure does
 * (reservations unlinked first; nothing is deleted if the scheduling store is away).
 */
const iso = (ms: number): string => new Date(ms).toISOString();

function hit(r: {
	subject: string;
	email: string | null;
	name: string | null;
	createdAt: number;
	lastSeenAt: number;
}): AccountHit {
	return {
		subject: r.subject,
		email: r.email,
		name: r.name,
		createdAt: iso(r.createdAt),
		lastSeenAt: iso(r.lastSeenAt),
	};
}

export function accountsPort(
	account: Account,
	reservations: ReservationsPort | undefined,
): NonNullable<ControlPorts["accounts"]> {
	return {
		async search(email) {
			return (await (await account.stores()).accounts.byEmail(email)).map(hit);
		},
		async person(subject): Promise<PersonView | null> {
			const s = await account.stores();
			const found = await s.accounts.get(subject);
			if (found === null) return null;
			const [consents, saved, conversations] = await Promise.all([
				s.consents.list(subject),
				s.savedArticles.list(subject),
				s.conversations.list(subject),
			]);
			let booked: PersonView["reservations"] = "not_applicable";
			if (reservations !== undefined) {
				try {
					booked = (await reservations.requests(subject)).map((r) => ({
						reference: r.reference,
						status: r.status,
						mode: r.mode,
						start: iso(r.start),
					}));
				} catch {
					booked = "unavailable";
				}
			}
			return {
				account: hit(found),
				consents: consents.map((c) => ({
					purpose: c.purpose,
					wordingVersion: c.wordingVersion,
					grantedAt: iso(c.grantedAt),
					withdrawnAt: c.withdrawnAt === null ? null : iso(c.withdrawnAt),
				})),
				savedArticles: saved.map((a) => ({ slug: a.slug, savedAt: iso(a.savedAt) })),
				reservations: booked,
				conversations: conversations.length,
			};
		},
		async export(subject) {
			const s = await account.stores();
			if ((await s.accounts.get(subject)) === null) return null;
			return exportAccount(s, reservations, subject);
		},
		async erase(subject) {
			const s = await account.stores();
			if ((await s.accounts.get(subject)) === null) return { ok: false, reason: "not_found" };
			try {
				await reservations?.unlink(subject);
			} catch {
				return { ok: false, reason: "unavailable" };
			}
			const sessionsEnded = await s.sessions.removeBySubject(subject);
			await s.accounts.erase(subject);
			return { ok: true, sessionsEnded };
		},
	};
}
