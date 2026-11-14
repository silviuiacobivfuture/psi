import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { MAX_PAGE, ROUTES, type RouteSpec } from "./index";

/**
 * Lists that are NOT cursor pages, each with what bounds it. A list that grows with the clinic (clients, visits, notes,
 * the journal...) never belongs here: it is a `page()` with a capped `limit` and a `cursor`.
 */
const BOUNDED: Readonly<Record<string, string>> = {
	"visitor.services": "the app's bookable services: configuration, a handful",
	"visitor.slots": "free times of one service in a window, capped by its own `limit` (max 200)",
	"me.get": "the apps the caller is a member of",
	"me.capabilities": "the permission catalogue: fixed by the contract",
	"roles.get": "one role's permission matrix: fixed by the catalogue",
	"roles.summary":
		"the app's roles (configuration, a handful) and their keys, each bounded by the catalogue",
	"members.get":
		"one member: their grants and matrix (the catalogue) and the team's calendars (the people)",
	"calendar.get": "one window of at most MAX_WINDOW_DAYS days (the month grid)",
	"calendar.summary": "one count per day of a window of at most MAX_WINDOW_DAYS days",
	"clients.get": "one client: who treats them (max 20) and their pinned notes",
	"roster.get": "one window of at most MAX_WINDOW_DAYS days",
	"series.get": "one weekly series: at most MAX_SERIES_OCCURRENCES appointments",
	"reminders.list": "one day's appointments",
	"blacklist.events": "keyset page: `before` and a `limit` of at most 200",
	"feedback.list": "keyset page: `before` and a `limit` of at most 200",
	"feedback.get": "one item and its replies",
	"notes.pinned": "the pinned notes of at most MAX_IDS named clients",
	"visitor.notifications":
		"a visitor's preferences: one row per notification kind, fixed by the catalogue",
	"me.notifications":
		"a member's preferences: one row per notification kind, fixed by the catalogue",
	"notifications.deliveries": "one UTC day of the delivery log, read at most 1000 entries",
	"staff.search": "people of the staff group matching a query: at most 20 (the schema's max)",
	"me.assistant":
		"the organisation's skills for the staff assistant: at most 20 (the document's max)",
};

const arraysOf = (schema: z.ZodType): string[] => {
	if (schema instanceof z.ZodArray) return ["(root)"];
	if (!(schema instanceof z.ZodObject)) return [];
	return Object.entries(schema.shape)
		.filter(([, v]) => v instanceof z.ZodArray)
		.map(([k]) => k);
};

/** `items` + an optional opaque `nextCursor`, `limit` capped at MAX_PAGE, and a `cursor`. */
function isCursorPage(r: Pick<RouteSpec, "response" | "query">): boolean {
	const res = r.response;
	if (!(res instanceof z.ZodObject) || !("items" in res.shape) || !("nextCursor" in res.shape))
		return false;
	const limit = r.query?.shape.limit;
	const cursor = r.query?.shape.cursor;
	if (limit === undefined || cursor === undefined) return false;
	return (
		!limit.safeParse(MAX_PAGE + 1).success &&
		limit.safeParse(MAX_PAGE).success &&
		!limit.safeParse(0).success
	);
}

const lists = ROUTES.filter(
	(r: RouteSpec) => r.method === "GET" && r.stream !== true && arraysOf(r.response).length > 0,
);

describe("every list answer is bounded", () => {
	it.each(
		lists.map((r) => [r.id, r] as const),
	)("%s is a capped cursor page or bounded", (id, r) => {
		if (Object.hasOwn(BOUNDED, id)) return;
		expect(isCursorPage(r), `${id} answers an array without a capped cursor page`).toBe(true);
	});

	it("names only routes that exist and answer a list that is not a cursor page", () => {
		for (const id of Object.keys(BOUNDED)) {
			const r = lists.find((x) => x.id === id);
			expect(r, `${id} is allowed as bounded but is no list route`).toBeDefined();
			if (r !== undefined) expect(isCursorPage(r), `${id} is a page: drop it`).toBe(false);
		}
	});

	it("the guard refuses an uncapped list and a page with no cap", () => {
		const bare = { response: z.object({ items: z.array(z.string()) }) };
		expect(isCursorPage(bare)).toBe(false);
		const uncapped = {
			...bare,
			response: z.object({ items: z.array(z.string()), nextCursor: z.string().optional() }),
			query: z.object({ limit: z.coerce.number().int().min(1), cursor: z.string().optional() }),
		};
		expect(isCursorPage(uncapped)).toBe(false);
		const capped = {
			...uncapped,
			query: z.object({
				limit: z.coerce.number().int().min(1).max(MAX_PAGE).optional(),
				cursor: z.string().optional(),
			}),
		};
		expect(isCursorPage(capped)).toBe(true);
	});
});
