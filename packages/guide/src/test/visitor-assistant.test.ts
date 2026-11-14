import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collect } from "@psi/engine/testing";
import { createKnowledge, createLexicalEmbedder, type KnowledgeStore } from "@psi/knowledge";
import type { VisitorAssistantRead, VisitorAssistantStore, VisitorMeter } from "@psi/scheduling";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createGuide,
	PSI_PROFILES,
	schedulingFromEnv,
	VISITOR_CONFIG_TTL_MS,
	visitorAssistantPort,
} from "../index";
import { hemisyncBookingUrl, pageUrl } from "../services/contact";

const ZERO: VisitorMeter = {
	messages: 0,
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	costMicroUsd: 0,
	limitHits: 0,
};

/** The store's visitor client, in memory: what it answers, and every call made to it. */
class FakeStore implements VisitorAssistantStore {
	read: VisitorAssistantRead | undefined = {
		timeZone: "Europe/Bucharest",
		period: { month: "2026-11", day: "2026-11-14" },
		platform: undefined,
		org: { revision: 1, body: '{"visitor":{}}' },
		usage: { month: ZERO, day: ZERO },
	};
	answer: "ok" | "not_found" | "invalid" = "ok";
	readonly calls: Array<string> = [];
	readonly recorded: Array<{ tenant: string; delta: VisitorMeter }> = [];
	async config(tenant: string): Promise<VisitorAssistantRead | undefined> {
		this.calls.push(`config:${tenant}`);
		return this.read;
	}
	async record(tenant: string, delta: VisitorMeter): Promise<"ok" | "not_found" | "invalid"> {
		this.calls.push(`record:${tenant}`);
		this.recorded.push({ tenant, delta });
		return this.answer;
	}
}

describe("the engine's port to the organisation's visitor settings", () => {
	it("hands on the documents as stored and the meters; an app the store does not have is undefined", async () => {
		const store = new FakeStore();
		store.read = {
			timeZone: "Europe/Bucharest",
			period: { month: "2026-11", day: "2026-11-14" },
			platform: { revision: 3, body: '{"p":1}' },
			org: { revision: 2, body: '{"o":1}' },
			usage: { month: { ...ZERO, messages: 4 }, day: ZERO },
		};
		const port = visitorAssistantPort(store);
		expect(await port.read("psizone")).toEqual({
			platform: '{"p":1}',
			org: '{"o":1}',
			usage: { month: { ...ZERO, messages: 4 }, day: ZERO },
		});
		store.read = undefined;
		expect(await visitorAssistantPort(store).read("psizone")).toBeUndefined();
	});

	it("an app with nothing saved hands on no documents", async () => {
		const store = new FakeStore();
		store.read = {
			timeZone: "Europe/Bucharest",
			period: { month: "2026-11", day: "2026-11-14" },
			platform: undefined,
			org: undefined,
			usage: { month: ZERO, day: ZERO },
		};
		expect(await visitorAssistantPort(store).read("psizone")).toEqual({
			usage: { month: ZERO, day: ZERO },
		});
	});

	it("a read is kept for its time, per app; past it, or after a recorded turn, the store is asked again", async () => {
		let now = 1_000;
		const store = new FakeStore();
		const port = visitorAssistantPort(store, VISITOR_CONFIG_TTL_MS, () => now);
		await port.read("psizone");
		await port.read("psizone");
		await port.read("other");
		expect(store.calls).toEqual(["config:psizone", "config:other"]);
		now += VISITOR_CONFIG_TTL_MS - 1;
		await port.read("psizone");
		expect(store.calls).toHaveLength(2);
		now += 1;
		await port.read("psizone");
		expect(store.calls).toHaveLength(3);
		await port.record("psizone", { ...ZERO, messages: 1 });
		await port.read("psizone");
		expect(store.calls.at(-1)).toBe("config:psizone");
		expect(store.calls.filter((c) => c === "config:psizone")).toHaveLength(3);
		expect(store.recorded).toEqual([{ tenant: "psizone", delta: { ...ZERO, messages: 1 } }]);
	});

	it.each([
		"not_found",
		"invalid",
	] as const)("a turn the store refuses (%s) is a failure the engine reports", async (answer) => {
		const store = new FakeStore();
		store.answer = answer;
		await expect(visitorAssistantPort(store).record("psizone", ZERO)).rejects.toThrow(answer);
	});

	it("the environment's scheduling carries the port beside the engine's", () => {
		const on = schedulingFromEnv({
			CONVEX_URL: "http://127.0.0.1:3210",
			PSI_SCHEDULING_KEY: "k".repeat(64),
		});
		expect(on.ok).toBe(true);
		if (on.ok) expect(Object.keys(on.scheduling.assistant).sort()).toEqual(["read", "record"]);
	});
});

describe("Psizone's guide on the organisation's settings", () => {
	let dir: string;
	let kb: KnowledgeStore;
	beforeEach(() => {
		vi.stubEnv("OPENROUTER_API_KEY", "");
		vi.stubEnv("CHROMA_URL", "");
		dir = mkdtempSync(join(tmpdir(), "psi-visitor-"));
		kb = createKnowledge({ url: `file:${join(dir, "kb.db")}`, embedder: createLexicalEmbedder() });
	});
	afterEach(async () => {
		vi.unstubAllEnvs();
		await kb.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it("only the brands that schedule carry the fallback copy, in both languages, to their own booking form", () => {
		expect(PSI_PROFILES.psizone.locales.ro?.fallback?.action.href).toBe(
			pageUrl("psizone", "ro", "/programare"),
		);
		expect(PSI_PROFILES.psizone.locales.en?.fallback?.action.href).toBe(
			pageUrl("psizone", "en", "/programare"),
		);
		expect(PSI_PROFILES.psizone.locales.en?.fallback?.person("0700 000 000")).toContain(
			"0700 000 000",
		);
		// Hemi-Sync's own booking page (/programare, /en/booking), and it is its default way to a person.
		for (const locale of ["ro", "en"] as const) {
			const fallback = PSI_PROFILES.hemisync.locales[locale]?.fallback;
			expect(fallback?.action.href).toBe(hemisyncBookingUrl(locale));
			expect(fallback?.contact).toBe(hemisyncBookingUrl(locale));
			expect(fallback?.paused).toContain("Hemi-Sync");
		}
		for (const brand of ["eqsync", "blog"] as const) {
			expect(PSI_PROFILES[brand].locales.ro?.fallback).toBeUndefined();
		}
	});

	it.each([
		["ro", "Ghidul face o pauză acum."],
		["en", "The guide is taking a break right now."],
	] as const)("switched off in the store (%s): the warm line and the booking form, and a limit met", async (locale, line) => {
		const store = new FakeStore();
		store.read = {
			timeZone: "Europe/Bucharest",
			period: { month: "2026-11", day: "2026-11-14" },
			platform: undefined,
			org: {
				revision: 1,
				body: JSON.stringify({
					revision: 1,
					staff: {},
					visitor: { enabled: false },
					skills: [],
					roles: {},
					people: {},
				}),
			},
			usage: { month: ZERO, day: ZERO },
		};
		const guide = createGuide({
			brand: "psizone",
			knowledge: kb,
			apiKey: "test-key",
			baseURL: "http://127.0.0.1:9",
			modelScreening: false,
			visitorAssistant: visitorAssistantPort(store),
		});
		const events = await collect(guide.ask({ question: "Cât costă o evaluare?", locale }));
		expect(events[0]).toMatchObject({ type: "text" });
		expect(events[0]?.type === "text" ? events[0].delta : "").toContain(line);
		expect(events[1]).toMatchObject({ type: "actions" });
		expect(events.at(-1)).toEqual({ type: "done" });
		expect(store.recorded).toEqual([{ tenant: "psizone", delta: { ...ZERO, limitHits: 1 } }]);
	});

	it("Hemi-Sync's guide is governed by its own organisation: its store's switch, its meters, its booking form", async () => {
		const store = new FakeStore();
		store.read = {
			timeZone: "Europe/Bucharest",
			period: { month: "2026-11", day: "2026-11-14" },
			platform: undefined,
			org: {
				revision: 1,
				body: JSON.stringify({
					revision: 1,
					staff: {},
					visitor: { enabled: false },
					skills: [],
					roles: {},
					people: {},
				}),
			},
			usage: { month: ZERO, day: ZERO },
		};
		const guide = createGuide({
			brand: "hemisync",
			knowledge: kb,
			apiKey: "test-key",
			baseURL: "http://127.0.0.1:9",
			modelScreening: false,
			visitorAssistant: visitorAssistantPort(store),
		});
		const events = await collect(guide.ask({ question: "Ce este Hemi-Sync?", locale: "ro" }));
		expect(events[0]?.type === "text" ? events[0].delta : "").toContain(
			"Ghidul face o pauză acum.",
		);
		expect(events[1]).toMatchObject({
			type: "actions",
			actions: [{ href: hemisyncBookingUrl("ro") }],
		});
		expect(store.recorded).toEqual([{ tenant: "hemisync", delta: { ...ZERO, limitHits: 1 } }]);
	});
});
