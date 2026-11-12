import { describe, expect, it } from "vitest";
import { askEvent, load, reset, restoreOnOpen, submit } from "./compass-actions";

interface Signals {
	compassOpen: boolean;
	compassQuery: string;
	compassTurns: Array<{ role: string; text: string }>;
	compassPending: string;
	compassChat: boolean;
	compassRemembered: boolean;
}

interface Posted {
	url: string;
	payload: Record<string, unknown>;
}

function signals(over: Partial<Signals> = {}): Signals {
	return {
		compassOpen: false,
		compassQuery: "",
		compassTurns: [],
		compassPending: "",
		compassChat: false,
		compassRemembered: false,
		...over,
	};
}

/**
 * Runs a Datastar expression the way Datastar does, near enough: `$name` reads and writes the
 * signal, `@post(url, options)` is recorded with the payload as it was at that moment.
 */
function run(
	expression: string,
	s: Signals,
	env: {
		picked?: { href: string } | null;
		detail?: unknown;
		chat?: unknown;
	} = {},
): { posts: Posted[]; location: { href: string } } {
	const posts: Posted[] = [];
	const location = { href: "/here", pathname: "/copii/adhd" };
	const nav = {
		querySelector: (sel: string) =>
			sel.includes("is-picked") ? (env.picked ?? null) : { removeAttribute() {}, focus() {} },
		querySelectorAll: () => [],
	};
	const el = { closest: () => nav };
	const code = expression
		.replace(/\$(compass[A-Za-z]+)/g, "__signals.$1")
		.replace(/@post\(/g, "post(");
	const post = (url: string, options: { payload: Record<string, unknown> }) => {
		posts.push({ url, payload: JSON.parse(JSON.stringify(options.payload)) });
	};
	const windowLike = { location, psiChat: env.chat };
	const documentLike = { getElementById: () => ({ replaceChildren() {} }) };
	new Function("__signals", "el", "evt", "post", "window", "document", code)(
		s,
		el,
		{ detail: env.detail },
		post,
		windowLike,
		documentLike,
	);
	return { posts, location };
}

const ACTION = "/ghid?target=compass-answer";

describe("sending from the compass", () => {
	it("Enter asks the guide, empties the field and opens the chat, even when a destination matches", () => {
		const s = signals({ compassQuery: "  Echipa  " });
		const { posts, location } = run(submit(ACTION), s, { picked: null });
		expect(posts).toEqual([
			{
				url: ACTION,
				payload: {
					compassOp: "ask",
					compassQuery: "Echipa",
					compassTurns: [],
					compassPage: { path: "/copii/adhd" },
				},
			},
		]);
		expect(location.href).toBe("/here");
		expect(s).toMatchObject({
			compassQuery: "",
			compassPending: "Echipa",
			compassChat: true,
			compassOpen: true,
		});
	});

	it("opens a destination only when it was picked with the arrow keys", () => {
		const s = signals({ compassQuery: "ech" });
		const picked = { href: "/echipa", offsetParent: {} };
		const { posts, location } = run(submit(ACTION), s, { picked });
		expect(posts).toEqual([]);
		expect(location.href).toBe("/echipa");
	});

	it("ignores an empty field, so a second Enter after sending sends nothing", () => {
		const s = signals({ compassQuery: "Q" });
		expect(run(submit(ACTION), s).posts).toHaveLength(1);
		expect(run(submit(ACTION), s).posts).toHaveLength(0);
		expect(run(submit(ACTION), signals({ compassQuery: "   " })).posts).toHaveLength(0);
		expect(run(submit(ACTION), signals({ compassQuery: "x".repeat(501) })).posts).toHaveLength(0);
	});

	it("a new question while one streams keeps the old one as unanswered, never in the posted question", () => {
		const s = signals({
			compassQuery: "second",
			compassPending: "first",
			compassTurns: [
				{ role: "user", text: "zero" },
				{ role: "guide", text: "Z." },
			],
		});
		const { posts } = run(submit(ACTION), s);
		expect(posts[0]?.payload).toEqual({
			compassOp: "ask",
			compassQuery: "second",
			compassTurns: [
				{ role: "user", text: "zero" },
				{ role: "guide", text: "Z." },
				{ role: "user", text: "first" },
			],
			compassPage: { path: "/copii/adhd" },
		});
		expect(s.compassPending).toBe("second");
	});

	it("a retry asks the same question again without adding it to the turns, and keeps the draft", () => {
		const s = signals({ compassPending: "lost", compassQuery: "draft" });
		const { posts } = run(askEvent(ACTION), s, { detail: "lost" });
		expect(posts[0]?.payload).toEqual({
			compassOp: "ask",
			compassQuery: "lost",
			compassTurns: [],
			compassPage: { path: "/copii/adhd" },
		});
		expect(s.compassQuery).toBe("draft");
	});
});

describe("keeping the conversation", () => {
	const kept = {
		turns: [
			{ role: "user", text: "a" },
			{ role: "guide", text: "A" },
		],
		pending: "b",
		draft: "c",
		remembered: false,
	};

	it("at load, puts the kept conversation back and asks once for its transcript", () => {
		let claims = 0;
		const chat = { load: () => kept, claim: () => ++claims === 1 };
		const s = signals();
		const { posts } = run(load(ACTION, "psi.chat.x"), s, { chat });
		expect(s).toMatchObject({
			compassTurns: kept.turns,
			compassPending: "b",
			compassQuery: "c",
			compassChat: true,
		});
		expect(posts).toEqual([
			{
				url: ACTION,
				payload: {
					compassOp: "restore",
					compassTurns: kept.turns,
					compassPending: "b",
				},
			},
		]);
		// The sheet opening later asks nothing more.
		expect(run(restoreOnOpen(ACTION), signals({ compassOpen: true }), { chat }).posts).toEqual([]);
	});

	it("with nothing kept, asks once when the sheet first opens (a remembered conversation elsewhere)", () => {
		let claims = 0;
		const chat = { load: () => null, claim: () => ++claims === 1 };
		const s = signals();
		expect(run(load(ACTION, "k"), s, { chat }).posts).toEqual([]);
		expect(run(restoreOnOpen(ACTION), signals({ compassOpen: false }), { chat }).posts).toEqual([]);
		expect(run(restoreOnOpen(ACTION), signals({ compassOpen: true }), { chat }).posts).toHaveLength(
			1,
		);
		expect(run(restoreOnOpen(ACTION), signals({ compassOpen: true }), { chat }).posts).toEqual([]);
	});

	it("New conversation clears every signal and the kept copy, and tells the server", () => {
		const cleared: string[] = [];
		const chat = { clear: (k: string) => cleared.push(k) };
		const s = signals({
			compassTurns: [{ role: "user", text: "a" }],
			compassPending: "b",
			compassQuery: "c",
			compassRemembered: true,
		});
		const { posts } = run(reset(ACTION, "psi.chat.x", "compass-answer"), s, {
			chat,
		});
		expect(s).toMatchObject({
			compassTurns: [],
			compassPending: "",
			compassQuery: "",
			compassRemembered: false,
			compassChat: true,
		});
		expect(cleared).toEqual(["psi.chat.x"]);
		expect(posts).toEqual([{ url: ACTION, payload: { compassOp: "reset" } }]);
	});
});
