/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Hono } from "hono";
import { z } from "zod";
import { bookingRef, formOf, PRIVATE, threadRef } from "./context";
import type { OwnReservation } from "./ports";
import type { Journey } from "./routes";
import { BookingsBody, ConversationsBody } from "./views-history";

const Reference = z.string().trim().min(8).max(12);
const LinkForm = z.object({
	reference: Reference,
	code: z.string().trim().min(16).max(24),
});
const TURNS_SHOWN = 20;

/** The person's requests, each allowed as viewer; null when the store or OpenFGA is away. */
export async function ownRequests(
	j: Journey,
	c: Parameters<Journey["gate"]>[0],
	subject: string,
): Promise<ReadonlyArray<OwnReservation> | null> {
	const { o } = j;
	if (o.reservations === undefined) return [];
	let rows: ReadonlyArray<OwnReservation>;
	try {
		rows = await o.reservations.requests(subject);
	} catch {
		return null;
	}
	const decisions = await o.account.decideMany(
		c,
		"viewer",
		rows.map((r) => bookingRef(r.reference, subject)),
	);
	const answers = rows.map((r) => decisions.get(bookingRef(r.reference, subject).object));
	if (answers.some((d) => d === "unavailable")) return null;
	return rows.filter((_, i) => answers[i] === "allowed");
}

/** Previous reservations and remembered conversations: each row allowed by OpenFGA before it is shown. */
export function registerHistoryRoutes(app: Hono, j: Journey): void {
	const { o, say, path } = j;
	const now = o.now ?? Date.now;

	app.get(path("bookings"), async (c) => {
		c.header("cache-control", PRIVATE["cache-control"]);
		const person = await j.gate(c, "viewer");
		if (person instanceof Response) return person;
		const rows = await ownRequests(j, c, person.subject);
		const ok = c.req.query("ok");
		return j.page(
			c,
			person,
			"bookings",
			"account_bookings_title",
			<BookingsBody
				say={say}
				base={o.base}
				locale={o.locale}
				enabled={o.reservations !== undefined}
				rows={rows}
				now={now()}
				linkFailed={c.req.query("link") === "failed"}
			/>,
			ok === "cancelled"
				? say("account_status_cancelled")
				: ok === "linked"
					? say("account_bookings_linked")
					: undefined,
		);
	});

	app.post(path("bookings", "/anuleaza"), async (c) => {
		if (j.foreign(c)) return c.body(null, 403);
		const person = await j.gate(c, "viewer", "bookings");
		if (person instanceof Response) return person;
		const reference = Reference.safeParse((await formOf(c)).reference);
		if (!reference.success || o.reservations === undefined) return c.body(null, 404);
		// The owner comes from the system of record: the store's rows for this account, never the form.
		let mine: ReadonlyArray<OwnReservation>;
		try {
			mine = await o.reservations.requests(person.subject);
		} catch {
			return j.unavailable(c);
		}
		const row = mine.find((r) => r.reference === reference.data.toUpperCase());
		if (row === undefined) return c.body(null, 404);
		const decision = await o.account.decide(c, "editor", bookingRef(row.reference, person.subject));
		if (decision === "unavailable") return j.unavailable(c);
		if (decision !== "allowed") return c.body(null, 404);
		try {
			if (!(await o.reservations.cancel(person.subject, row.reference))) return c.body(null, 404);
		} catch {
			return j.unavailable(c);
		}
		return c.redirect(`${path("bookings")}?ok=cancelled`, 303);
	});

	app.post(path("bookings", "/leaga"), async (c) => {
		if (j.foreign(c)) return c.body(null, 403);
		const person = await j.gate(c, "editor", "bookings");
		if (person instanceof Response) return person;
		const form = LinkForm.safeParse(await formOf(c));
		if (!form.success || o.reservations === undefined) {
			return c.redirect(`${path("bookings")}?link=failed`, 303);
		}
		try {
			const linked = await o.reservations.link(person.subject, form.data.reference, form.data.code);
			return c.redirect(`${path("bookings")}?${linked ? "ok=linked" : "link=failed"}`, 303);
		} catch {
			return j.unavailable(c);
		}
	});

	app.get(path("conversations"), async (c) => {
		c.header("cache-control", PRIVATE["cache-control"]);
		const person = await j.gate(c, "viewer");
		if (person instanceof Response) return person;
		const stores = await o.account.stores();
		const [consented, all] = await Promise.all([
			stores.consents.current(person.subject, "guide_memory"),
			stores.conversations.list(person.subject),
		]);
		const decisions = await o.account.decideMany(
			c,
			"viewer",
			all.map((x) => threadRef(x.id, x.subject)),
		);
		const answers = all.map((x) => decisions.get(threadRef(x.id, x.subject).object));
		if (answers.some((d) => d === "unavailable")) return j.unavailable(c);
		const shown = all.filter((_, i) => answers[i] === "allowed");
		const conversations = await Promise.all(
			shown.map(async (conversation) => ({
				conversation,
				turns: await stores.conversations.turns(conversation.id, TURNS_SHOWN),
			})),
		);
		return j.page(
			c,
			person,
			"conversations",
			"account_conversations_title",
			<ConversationsBody
				say={say}
				base={o.base}
				locale={o.locale}
				consented={consented}
				conversations={conversations}
				siteNames={o.siteNames}
			/>,
		);
	});

	app.post(
		path("conversations", "/:id/sterge"),
		async (c, next) => {
			if (j.foreign(c)) return c.body(null, 403);
			await next();
		},
		o.account.can(
			"forgetter",
			async (c) => {
				const row = await (await o.account.stores()).conversations.get(c.req.param("id") ?? "");
				return row === null ? null : threadRef(row.id, row.subject);
			},
			{ unavailable: j.unavailable },
		),
		async (c) => {
			await (await o.account.stores()).conversations.remove(c.req.param("id") ?? "");
			return c.redirect(path("conversations"), 303);
		},
	);

	app.post(path("conversations", "/sterge-tot"), async (c) => {
		if (j.foreign(c)) return c.body(null, 403);
		const person = await j.gate(c, "viewer", "conversations");
		if (person instanceof Response) return person;
		// Each conversation is forgotten only where OpenFGA allows `forgetter` on it, like delete-one.
		const stores = await o.account.stores();
		const all = await stores.conversations.list(person.subject);
		const refs = all.map((x) => threadRef(x.id, x.subject));
		const decisions = await o.account.decideMany(c, "forgetter", refs);
		if (refs.some((ref) => decisions.get(ref.object) === "unavailable")) return j.unavailable(c);
		for (const [i, x] of all.entries()) {
			const ref = refs[i];
			if (ref !== undefined && decisions.get(ref.object) === "allowed") {
				await stores.conversations.remove(x.id);
			}
		}
		return c.redirect(path("conversations"), 303);
	});
}
