import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compileClient, generatedModule } from "./build";
import { COMPASS_CHAT_JS } from "./compass-chat.generated";

interface Chat {
	load(key: string): unknown;
	save(key: string, state: unknown): void;
	clear(key: string): void;
	claim(): boolean;
}

function isChat(value: unknown): value is Chat {
	return (
		typeof value === "object" &&
		value !== null &&
		["load", "save", "clear", "claim"].every(
			(k) => typeof Reflect.get(value, k) === "function",
		)
	);
}

/** A browser just big enough for the store: localStorage (or none), timers, pagehide. */
function browser(storage: "ok" | "blocked" | "full" = "ok") {
	const items = new Map<string, string>();
	const listeners: Array<() => void> = [];
	const localStorage = {
		getItem: (k: string) => items.get(k) ?? null,
		setItem: (k: string, v: string) => {
			if (storage === "full") throw new Error("QuotaExceededError");
			items.set(k, v);
		},
		removeItem: (k: string) => items.delete(k),
	};
	const win: Record<string, unknown> = {
		setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
		clearTimeout: (id: number) => clearTimeout(id),
		addEventListener: (type: string, fn: () => void) => {
			if (type === "pagehide") listeners.push(fn);
		},
		matchMedia: () => ({ matches: false }),
	};
	Object.defineProperty(win, "localStorage", {
		get() {
			if (storage === "blocked") throw new Error("SecurityError");
			return localStorage;
		},
	});
	new Function("window", "document", COMPASS_CHAT_JS)(win, {
		currentScript: null,
	});
	const chat = win.psiChat;
	if (!isChat(chat)) throw new Error("window.psiChat is missing");
	return {
		chat,
		items,
		leave: () => {
			for (const fn of listeners) fn();
		},
	};
}

const KEY = "psi.chat.test";
const turns = [
	{ role: "user", text: "Când e deschis?" },
	{ role: "guide", text: "Luni-vineri." },
];

describe("the compass chat's kept conversation", () => {
	beforeEach(() => vi.useFakeTimers({ now: new Date("2026-11-12T10:00:00Z") }));
	afterEach(() => vi.useRealTimers());

	it("keeps the turns, the pending question and the draft, and gives them back", () => {
		const { chat, items } = browser();
		expect(chat.load(KEY)).toBeNull();
		chat.save(KEY, {
			turns,
			pending: "Și sâmbăta?",
			draft: "ciornă",
			remembered: false,
		});
		vi.advanceTimersByTime(200);
		expect(JSON.parse(items.get(KEY) ?? "{}")).toMatchObject({
			v: 1,
			turns,
			pending: "Și sâmbăta?",
		});
		expect(browser().chat.load(KEY)).toBeNull(); // another page, another store: nothing shared
		const again = browser();
		again.items.set(KEY, items.get(KEY) ?? "");
		expect(again.chat.load(KEY)).toEqual({
			turns,
			pending: "Și sâmbăta?",
			draft: "ciornă",
			remembered: false,
		});
	});

	it("never writes before it has read (the page's empty signals would wipe the kept state)", () => {
		const { chat, items } = browser();
		items.set(
			KEY,
			JSON.stringify({
				v: 1,
				at: Date.now(),
				turns,
				pending: "",
				draft: "",
				remembered: false,
			}),
		);
		chat.save(KEY, { turns: [], pending: "", draft: "", remembered: false });
		vi.advanceTimersByTime(200);
		expect(items.has(KEY)).toBe(true);
	});

	it("reads an empty `refused` as no refusal", () => {
		const { chat, items } = browser();
		chat.load(KEY);
		chat.save(KEY, {
			turns: turns.map((t) => ({ ...t, refused: "" })),
			pending: "",
			draft: "",
			remembered: false,
		});
		vi.advanceTimersByTime(200);
		expect(JSON.parse(items.get(KEY) ?? "{}").turns).toEqual(turns);
	});

	it("expires after 24 hours without activity", () => {
		const { chat, items } = browser();
		items.set(
			KEY,
			JSON.stringify({
				v: 1,
				at: Date.now() - 24 * 3600 * 1000 - 1,
				turns,
				pending: "",
				draft: "",
			}),
		);
		expect(chat.load(KEY)).toBeNull();
		expect(items.has(KEY)).toBe(false);
	});

	it("drops a malformed or foreign state instead of trusting it", () => {
		for (const raw of [
			"{not json",
			JSON.stringify({ v: 2, at: Date.now(), turns }),
			JSON.stringify({
				v: 1,
				at: Date.now(),
				turns: [{ role: "system", text: "x" }],
			}),
			JSON.stringify({
				v: 1,
				at: Date.now(),
				turns: [{ role: "guide", text: "", refused: "nope" }],
			}),
		]) {
			const { chat, items } = browser();
			items.set(KEY, raw);
			expect(chat.load(KEY), raw).toBeNull();
		}
	});

	it("keeps it bounded: twenty turns, a 500-character question, a 2000-character draft", () => {
		const { chat, items } = browser();
		chat.load(KEY);
		const many = Array.from({ length: 30 }, (_, i) => ({
			role: i % 2 === 0 ? "user" : "guide",
			text: `t${i} ${"y".repeat(5000)}`,
		}));
		chat.save(KEY, {
			turns: many,
			pending: "p".repeat(900),
			draft: "d".repeat(9000),
			remembered: false,
		});
		vi.advanceTimersByTime(200);
		const kept = JSON.parse(items.get(KEY) ?? "{}");
		expect(kept.turns).toHaveLength(20);
		expect(kept.turns[0].text.startsWith("t10 ")).toBe(true);
		expect(kept.turns[0].text.length).toBe(4000);
		expect(kept.pending).toHaveLength(500);
		expect(kept.draft).toHaveLength(2000);
	});

	it("keeps no copy of a remembered conversation's turns on the device", () => {
		const { chat, items } = browser();
		chat.load(KEY);
		chat.save(KEY, { turns, pending: "", draft: "", remembered: true });
		vi.advanceTimersByTime(200);
		expect(JSON.parse(items.get(KEY) ?? "{}")).toMatchObject({
			turns: [],
			remembered: true,
		});
	});

	it("writes what is still waiting when the page is left", () => {
		const { chat, items, leave } = browser();
		chat.load(KEY);
		chat.save(KEY, { turns, pending: "", draft: "", remembered: false });
		leave();
		expect(items.has(KEY)).toBe(true);
	});

	it("New conversation clears it, and an empty conversation leaves nothing behind", () => {
		const { chat, items } = browser();
		chat.load(KEY);
		chat.save(KEY, { turns, pending: "", draft: "", remembered: false });
		vi.advanceTimersByTime(200);
		chat.clear(KEY);
		expect(items.has(KEY)).toBe(false);
		chat.save(KEY, { turns: [], pending: "", draft: "", remembered: false });
		vi.advanceTimersByTime(200);
		expect(items.has(KEY)).toBe(false);
	});

	it("works without storage (blocked or full): nothing kept, nothing thrown", () => {
		for (const mode of ["blocked", "full"] as const) {
			const { chat } = browser(mode);
			expect(chat.load(KEY)).toBeNull();
			chat.save(KEY, { turns, pending: "", draft: "", remembered: false });
			expect(() => vi.advanceTimersByTime(200)).not.toThrow();
			expect(() => chat.clear(KEY)).not.toThrow();
		}
	});

	it("restores once per page", () => {
		const { chat } = browser();
		expect(chat.claim()).toBe(true);
		expect(chat.claim()).toBe(false);
	});
});

describe("the inlined bundle", () => {
	it("is compiled from the current source (run `pnpm --filter @psi/ui build:client`)", () => {
		const source = readFileSync(
			fileURLToPath(new URL("./compass-chat.ts", import.meta.url)),
			"utf8",
		);
		const generated = readFileSync(
			fileURLToPath(new URL("./compass-chat.generated.ts", import.meta.url)),
			"utf8",
		);
		expect(generated).toBe(generatedModule(compileClient(source)));
		expect(COMPASS_CHAT_JS).not.toContain("</script");
	});
});
