import { randomUUID } from "node:crypto";
import type {
	AccountRecord,
	ConsentRecord,
	Conversation,
	ConversationTurn,
	Profile,
	SavedArticle,
	SessionRecord,
	SessionStore,
	Stores,
} from "./types";

/** One process's stores, for tests and for a workstation with no ACCOUNT_DATABASE_URL. Never used in production. */
export function memoryStores(): Stores {
	const sessions = new Map<string, SessionRecord>();
	const accounts = new Map<string, AccountRecord>();
	const links = new Set<string>();
	const saved = new Map<string, SavedArticle>();
	const profiles = new Map<string, Profile>();
	const consents = new Map<string, Array<ConsentRecord>>();
	const conversations = new Map<string, Conversation>();
	const turns = new Map<string, Array<ConversationTurn>>();

	const removeWhere = (pred: (r: SessionRecord) => boolean): number => {
		let n = 0;
		for (const [k, r] of sessions) {
			if (pred(r)) {
				sessions.delete(k);
				n++;
			}
		}
		return n;
	};
	const dropConversations = (subject: string): void => {
		for (const [id, c] of conversations) {
			if (c.subject !== subject) continue;
			conversations.delete(id);
			turns.delete(id);
		}
	};

	const sessionStore: SessionStore = {
		async create(idHash, record) {
			sessions.set(idHash, { ...record });
		},
		async read(idHash) {
			const r = sessions.get(idHash);
			return r === undefined ? null : { ...r };
		},
		async touch(idHash, at) {
			const r = sessions.get(idHash);
			if (r !== undefined) r.lastSeenAt = at;
		},
		async remove(idHash) {
			sessions.delete(idHash);
		},
		async removeBySid(issuer, sid) {
			return removeWhere((r) => r.issuer === issuer && r.sid === sid);
		},
		async removeBySubject(subject) {
			return removeWhere((r) => r.subject === subject);
		},
	};

	return {
		sessions: sessionStore,
		accounts: {
			async signedIn(identity, at) {
				links.add(`${identity.issuer}\u0000${identity.subject}`);
				const prev = accounts.get(identity.subject);
				accounts.set(identity.subject, {
					subject: identity.subject,
					email: identity.email,
					name: identity.name,
					createdAt: prev?.createdAt ?? at,
					lastSeenAt: at,
				});
			},
			async get(subject) {
				const r = accounts.get(subject);
				return r === undefined ? null : { ...r };
			},
			async erase(subject) {
				accounts.delete(subject);
				for (const link of links) if (link.endsWith(`\u0000${subject}`)) links.delete(link);
				removeWhere((r) => r.subject === subject);
				for (const [id, s] of saved) if (s.subject === subject) saved.delete(id);
				profiles.delete(subject);
				consents.delete(subject);
				dropConversations(subject);
			},
		},
		savedArticles: {
			async list(subject) {
				return [...saved.values()]
					.filter((s) => s.subject === subject)
					.sort((a, b) => b.savedAt - a.savedAt);
			},
			async save(subject, slug, at) {
				const existing = [...saved.values()].find((s) => s.subject === subject && s.slug === slug);
				if (existing !== undefined) return existing;
				const row: SavedArticle = {
					id: randomUUID(),
					subject,
					slug,
					savedAt: at,
				};
				saved.set(row.id, row);
				return row;
			},
			async get(id) {
				return saved.get(id) ?? null;
			},
			async remove(id) {
				saved.delete(id);
			},
		},
		profiles: {
			async get(subject) {
				const p = profiles.get(subject);
				return p === undefined ? null : { ...p };
			},
			async save(subject, profile, at) {
				profiles.set(subject, { ...profile, updatedAt: at });
			},
		},
		consents: {
			async list(subject) {
				return [...(consents.get(subject) ?? [])].sort((a, b) => b.grantedAt - a.grantedAt);
			},
			async current(subject, purpose) {
				return (consents.get(subject) ?? []).some(
					(c) => c.purpose === purpose && c.withdrawnAt === null,
				);
			},
			async grant(subject, purpose, wordingVersion, at) {
				const rows = consents.get(subject) ?? [];
				if (rows.some((c) => c.purpose === purpose && c.withdrawnAt === null)) return;
				rows.push({
					purpose,
					wordingVersion,
					grantedAt: at,
					withdrawnAt: null,
				});
				consents.set(subject, rows);
			},
			async withdraw(subject, purpose, at) {
				for (const c of consents.get(subject) ?? []) {
					if (c.purpose === purpose && c.withdrawnAt === null) c.withdrawnAt = at;
				}
				if (purpose === "guide_memory") dropConversations(subject);
			},
		},
		conversations: {
			async list(subject) {
				return [...conversations.values()]
					.filter((c) => c.subject === subject)
					.sort((a, b) => b.updatedAt - a.updatedAt)
					.map((c) => ({ ...c }));
			},
			async get(id) {
				const c = conversations.get(id);
				return c === undefined ? null : { ...c };
			},
			async turns(id, limit) {
				return (turns.get(id) ?? []).slice(-limit);
			},
			async forSite(subject, site) {
				const c = [...conversations.values()].find((x) => x.subject === subject && x.site === site);
				return c === undefined ? null : { ...c };
			},
			async append(subject, site, turn) {
				let c = [...conversations.values()].find((x) => x.subject === subject && x.site === site);
				if (c === undefined) {
					c = {
						id: randomUUID(),
						subject,
						site,
						startedAt: turn.at,
						updatedAt: turn.at,
						turns: 0,
					};
					conversations.set(c.id, c);
				}
				const list = turns.get(c.id) ?? [];
				list.push(turn);
				turns.set(c.id, list);
				c.turns = list.length;
				c.updatedAt = turn.at;
			},
			async remove(id) {
				conversations.delete(id);
				turns.delete(id);
			},
			async removeAll(subject) {
				dropConversations(subject);
			},
		},
		async close() {},
	};
}
