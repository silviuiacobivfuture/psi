import {
	CIPHERTEXT_MAX,
	deriveLinkKey,
	type FeedbackEvent,
	feedbackContactSchema,
	feedbackProblems,
	LINK_TTL_DEFAULT_HOURS,
	type LinkClaims,
	newLinkId,
	nextStatus,
	signLink,
	ttlAllowed,
	verifyLink,
} from "@psi/scheduling/clinic";
import { currentActor } from "./actor";
import { newId } from "./ids";
import type {
	FeedbackContactFields,
	FeedbackFilter,
	FeedbackGroups,
	FeedbackPort,
	FeedbackReplyRow,
	FeedbackRow,
} from "./ports";
import { type Collection, type Rows, StoreRefused } from "./types";

type Cs = { [K in keyof Rows]: Collection<Rows[K]> };

/** What a rating can be about: a staff visit, or a public booking by its reference. */
export interface Rateable {
	id: string;
	start: number;
	end: number;
	/** The visit's client, when it has one. */
	client?: string | undefined;
	confirmed: boolean;
	attended: boolean;
}

interface Stored extends FeedbackRow {
	app: string;
	/** The order they were stored in: items of one instant list newest-stored first, as Convex does. */
	seq: number;
	accountHash?: string;
}
interface Link {
	app: string;
	jti: string;
	kind: "visit" | "appointment";
	subject: string;
	expiresAt: number;
	usedAt?: number;
	feedback?: string;
}

const HOUR = 3_600_000;
const SYSTEM = "system:feedback-link";

/** A rating needs an appointment that is over, confirmed and not missed (the rule of `feedbackSupport.ratable`). */
const ratable = (s: Rateable, now: number): boolean => s.confirmed && s.attended && s.end <= now;

export function createMemoryFeedback(
	c: Cs,
	clock: () => number,
	/** A public booking by its reference, from the visitor flow's own rows. */
	booking: (app: string, reference: string) => Rateable | undefined,
	/** A public booking by the id a link carries. */
	bookingById: (app: string, id: string) => Rateable | undefined,
): { port: FeedbackPort; state(): unknown } {
	const items = new Map<string, Stored>();
	let stored = 0;
	const nextSeq = (): number => {
		stored += 1;
		return stored;
	};
	const replies: (FeedbackReplyRow & { app: string; feedback: string })[] = [];
	const links = new Map<string, Link>();
	// The Convex store signs with a key derived from its server key: here one of the store's own.
	const key = deriveLinkKey(`memory-store-feedback-link-key-${newId("k")}${newId("k")}`);

	async function visitOf(app: string, id: string): Promise<Rateable | undefined> {
		const a = await c.appointments.get(app, id);
		if (a === undefined || a.deletedAt !== undefined) return undefined;
		return {
			id: a.id,
			start: a.start,
			end: a.end,
			client: a.clientId,
			confirmed: a.status !== "cancelled",
			attended: a.status !== "no_show",
		};
	}

	const shown = (row: Stored, groups: FeedbackGroups): FeedbackRow => ({
		id: row.id,
		kind: row.kind,
		channel: row.channel,
		status: row.status,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		version: row.version,
		linkedAccount: row.linkedAccount,
		...(row.readAt === undefined ? {} : { readAt: row.readAt }),
		...(row.answeredAt === undefined ? {} : { answeredAt: row.answeredAt }),
		...(row.closedAt === undefined ? {} : { closedAt: row.closedAt }),
		...(row.visit === undefined ? {} : { visit: row.visit }),
		...(row.appointment === undefined ? {} : { appointment: row.appointment }),
		...(row.client === undefined ? {} : { client: row.client }),
		...(groups.includes("core")
			? {
					...(row.rating === undefined ? {} : { rating: row.rating }),
					...(row.textSealed === undefined ? {} : { textSealed: row.textSealed }),
				}
			: {}),
		...(groups.includes("contact")
			? {
					consentContact: row.consentContact ?? false,
					...(row.contact === undefined ? {} : { contact: row.contact }),
					...(row.staffSubject === undefined ? {} : { staffSubject: row.staffSubject }),
				}
			: {}),
	});

	const mine = (app: string, id: string): Stored | undefined => {
		const row = items.get(id);
		return row?.app === app ? row : undefined;
	};

	function move(row: Stored, event: FeedbackEvent, now: number): ReturnType<typeof nextStatus> {
		const change = nextStatus(row.status, event);
		if (change.ok && change.changed) {
			row.status = change.next;
			row.updatedAt = now;
			row.version += 1;
			if (change.next === "read" && event === "read") row.readAt = now;
			if (change.next === "answered") row.answeredAt = now;
			if (change.next === "closed") row.closedAt = now;
			if (event === "reopen") delete row.closedAt;
		}
		return change;
	}

	/** Opens a link: its signature, its app, its single use, and whether what it is about is still there. */
	async function open(app: string, token: string, now: number) {
		const verified = await verifyLink(await key, token, now);
		if (!verified.ok)
			return {
				ok: false as const,
				reason: verified.reason === "expired" ? "expired" : "invalid_link",
			};
		const claims: LinkClaims = verified.claims;
		if (claims.a !== app) return { ok: false as const, reason: "wrong_app" };
		const link = links.get(claims.j);
		if (
			link === undefined ||
			link.app !== app ||
			link.subject !== claims.s ||
			link.kind !== claims.k
		)
			return { ok: false as const, reason: "invalid_link" };
		if (link.usedAt !== undefined) return { ok: false as const, reason: "used" };
		const subject =
			link.kind === "visit" ? await visitOf(app, link.subject) : bookingById(app, link.subject);
		if (subject === undefined) return { ok: false as const, reason: "subject_gone" };
		if (subject.client !== undefined) {
			const client = await c.clients.get(app, subject.client);
			if (client === undefined || client.status === "deleted")
				return { ok: false as const, reason: "subject_gone" };
		}
		return { ok: true as const, link, subject };
	}

	async function store(
		app: string,
		input: {
			kind: FeedbackRow["kind"];
			channel: FeedbackRow["channel"];
			rating?: number | undefined;
			textSealed?: string | undefined;
			visit?: string | undefined;
			appointment?: string | undefined;
			consentContact: boolean;
			contact?: FeedbackContactFields | undefined;
		},
		resolved: Rateable | undefined,
		now: number,
	): Promise<Stored> {
		const problems = feedbackProblems({
			kind: input.kind,
			rating: input.rating,
			hasText: input.textSealed !== undefined,
			channel: input.channel,
			visit: input.visit,
			appointment: input.appointment,
			consentContact: input.consentContact,
			hasContact: input.contact !== undefined,
		});
		if (problems.length > 0) throw new StoreRefused("invalid", { problems });
		if (input.textSealed !== undefined && input.textSealed.length > CIPHERTEXT_MAX)
			throw new StoreRefused("too_long");
		const contact =
			input.contact === undefined ? undefined : feedbackContactSchema.safeParse(input.contact);
		if (contact !== undefined && !contact.success)
			throw new StoreRefused("invalid", { problems: ["contact"] });
		const subject = resolved;
		if (input.kind === "appointment_rating") {
			if (subject === undefined || !ratable(subject, now)) throw new StoreRefused("not_eligible");
			const twin = [...items.values()].find(
				(f) =>
					f.app === app &&
					f.kind === "appointment_rating" &&
					(input.visit !== undefined ? f.visit === subject.id : f.appointment === subject.id),
			);
			if (twin !== undefined) throw new StoreRefused("already_rated");
		}
		const row: Stored = {
			id: newId("f"),
			app,
			seq: nextSeq(),
			kind: input.kind,
			channel: input.channel,
			status: "new",
			createdAt: now,
			updatedAt: now,
			version: 1,
			linkedAccount: false,
			consentContact: input.consentContact,
			...(input.rating === undefined ? {} : { rating: input.rating }),
			...(input.textSealed === undefined ? {} : { textSealed: input.textSealed }),
			...(input.visit === undefined ? {} : { visit: subject?.id ?? input.visit }),
			...(input.appointment === undefined ? {} : { appointment: subject?.id ?? input.appointment }),
			...(subject?.client === undefined ? {} : { client: subject.client }),
			...(contact?.success === true ? { contact: contact.data } : {}),
		};
		items.set(row.id, row);
		await c.audit.insert({
			id: newId("e"),
			app,
			at: now,
			actor: { subject: SYSTEM, kind: "service" },
			action: "feedback.create",
			target: { type: "feedback", id: row.id },
			detail: { fields: ["kind", "channel", ...(input.rating === undefined ? [] : ["rating"])] },
		});
		return row;
	}

	const port: FeedbackPort = {
		async list(app, groups, filter: FeedbackFilter) {
			const limit = Math.max(1, Math.min(200, Math.floor(filter.limit ?? 50)));
			const upper = Math.min(
				filter.before ?? Number.MAX_SAFE_INTEGER,
				filter.to ?? Number.MAX_SAFE_INTEGER,
			);
			const wanted = filter.statuses === undefined ? undefined : new Set(filter.statuses);
			const matching = [...items.values()]
				.filter(
					(r) =>
						r.app === app &&
						r.createdAt >= (filter.from ?? 0) &&
						r.createdAt < upper &&
						(wanted === undefined || wanted.has(r.status)) &&
						(filter.kind === undefined || r.kind === filter.kind) &&
						(filter.channel === undefined || r.channel === filter.channel) &&
						(filter.minRating === undefined ||
							(r.rating !== undefined && r.rating >= filter.minRating)) &&
						(filter.maxRating === undefined ||
							(r.rating !== undefined && r.rating <= filter.maxRating)),
				)
				.sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
			return {
				items: matching.slice(0, limit).map((r) => shown(r, groups)),
				more: matching.length > limit,
			};
		},
		async get(app, id, groups) {
			const row = mine(app, id);
			if (row === undefined) return undefined;
			return {
				item: shown(row, groups),
				replies: groups.includes("core")
					? replies
							.filter((r) => r.app === app && r.feedback === id)
							.map(({ app: _a, feedback: _f, ...r }) => r)
					: [],
			};
		},
		async reply(app, id, textSealed) {
			const row = mine(app, id);
			if (row === undefined) throw new StoreRefused("not_found");
			if (textSealed.length > CIPHERTEXT_MAX) throw new StoreRefused("too_long");
			const now = clock();
			const moved = move(row, "reply", now);
			if (!moved.ok) throw new StoreRefused(moved.reason);
			const made = { id: newId("r"), app, feedback: id, by: currentActor(), at: now, textSealed };
			replies.push(made);
			if (!moved.changed) {
				row.updatedAt = now;
				row.version += 1;
			}
			return {
				status: moved.next,
				contactable: row.consentContact === true,
				replyId: made.id,
				at: now,
			};
		},
		async setStatus(app, id, event, expectedVersion) {
			const row = mine(app, id);
			if (row === undefined) throw new StoreRefused("not_found");
			if (expectedVersion !== undefined && row.version !== expectedVersion)
				throw new StoreRefused("stale");
			const moved = move(row, event, clock());
			if (!moved.ok) throw new StoreRefused(moved.reason);
			return { status: moved.next, changed: moved.changed };
		},
		async issueLink(app, target, ttlHours) {
			if ((target.visit === undefined) === (target.appointment === undefined))
				throw new StoreRefused("invalid");
			const ttl = ttlHours ?? LINK_TTL_DEFAULT_HOURS;
			if (!ttlAllowed(ttl)) throw new StoreRefused("invalid_ttl");
			const kind = target.visit === undefined ? "appointment" : "visit";
			const subject =
				target.visit !== undefined
					? await visitOf(app, target.visit)
					: booking(app, target.appointment ?? "");
			if (subject === undefined) throw new StoreRefused("not_found");
			const now = clock();
			if (!ratable(subject, now)) throw new StoreRefused("not_eligible");
			const jti = newLinkId();
			const expiresAt = now + ttl * HOUR;
			const token = await signLink(await key, {
				a: app,
				j: jti,
				k: kind,
				s: subject.id,
				e: expiresAt,
			});
			links.set(jti, { app, jti, kind, subject: subject.id, expiresAt });
			return { token, expiresAt };
		},
		async inspectLink(app, token) {
			const opened = await open(app, token, clock());
			if (!opened.ok) throw new StoreRefused(opened.reason);
			return { start: opened.subject.start, expiresAt: opened.link.expiresAt };
		},
		async redeem(app, token, input) {
			const now = clock();
			const opened = await open(app, token, now);
			if (!opened.ok) throw new StoreRefused(opened.reason);
			const isVisit = opened.link.kind === "visit";
			const row = await store(
				app,
				{
					kind: "appointment_rating",
					channel: "email_link",
					...input,
					...(isVisit ? { visit: opened.subject.id } : { appointment: opened.subject.id }),
				},
				opened.subject,
				now,
			);
			opened.link.usedAt = now;
			opened.link.feedback = row.id;
			return { id: row.id };
		},
	};
	return { port, state: () => [[...items.entries()], replies, [...links.entries()]] };
}
