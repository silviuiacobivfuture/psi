import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VisitorUsageRecord } from "@psi/engine";
import { collect } from "@psi/engine/testing";
import { createKnowledge, createLexicalEmbedder, type KnowledgeStore } from "@psi/knowledge";
import { BUILT_IN_SETTINGS } from "@psi/scheduling-sdk/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createGuide,
	PSI_PROFILES,
	VISITOR_CONFIG_TTL_MS,
	type VisitorAssistantSource,
	visitorAssistantPort,
} from "../index";
import { hemisyncBookingUrl, pageUrl } from "../services/contact";

const ZERO: VisitorUsageRecord = {
	messages: 0,
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	costMicroUsd: 0,
	limitHits: 0,
};

type Read = Awaited<ReturnType<VisitorAssistantSource["read"]>>;

/** The scheduling service's visitor-assistant routes, in memory: what they answer, and every call made to them. */
class FakeSource implements VisitorAssistantSource {
	answer: Read = { settings: BUILT_IN_SETTINGS.visitor, usage: { month: ZERO, day: ZERO } };
	failing = false;
	readonly calls: Array<string> = [];
	readonly recorded: Array<{ tenant: string; delta: VisitorUsageRecord }> = [];
	/** The organisation's visitor settings changed from the built-in ones. */
	with(over: Partial<typeof BUILT_IN_SETTINGS.visitor>): this {
		this.answer = {
			settings: { ...BUILT_IN_SETTINGS.visitor, ...over },
			usage: { month: ZERO, day: ZERO },
		};
		return this;
	}
	async read(tenant: string): Promise<Read> {
		this.calls.push(`read:${tenant}`);
		if (this.failing) throw new Error("the scheduling service could not be asked");
		return this.answer;
	}
	async record(tenant: string, delta: VisitorUsageRecord): Promise<void> {
		this.calls.push(`record:${tenant}`);
		if (this.failing) throw new Error("the scheduling service could not be asked");
		this.recorded.push({ tenant, delta });
	}
}

describe("the engine's port to the organisation's visitor settings", () => {
	it("hands on what the service merged and the meters; an app the service does not have is undefined", async () => {
		const source = new FakeSource();
		source.answer = {
			settings: { ...BUILT_IN_SETTINGS.visitor, enabled: false },
			usage: { month: { ...ZERO, messages: 4 }, day: ZERO },
		};
		expect(await visitorAssistantPort(source).read("psizone")).toEqual({
			settings: { ...BUILT_IN_SETTINGS.visitor, enabled: false },
			usage: { month: { ...ZERO, messages: 4 }, day: ZERO },
		});
		source.answer = undefined;
		expect(await visitorAssistantPort(source).read("psizone")).toBeUndefined();
	});

	it("a read is kept for its time, per app; past it, or after a recorded turn, the service is asked again", async () => {
		let now = 1_000;
		const source = new FakeSource();
		const port = visitorAssistantPort(source, VISITOR_CONFIG_TTL_MS, () => now);
		await port.read("psizone");
		await port.read("psizone");
		await port.read("other");
		expect(source.calls).toEqual(["read:psizone", "read:other"]);
		now += VISITOR_CONFIG_TTL_MS - 1;
		await port.read("psizone");
		expect(source.calls).toHaveLength(2);
		now += 1;
		await port.read("psizone");
		expect(source.calls).toHaveLength(3);
		await port.record("psizone", { ...ZERO, messages: 1 });
		await port.read("psizone");
		expect(source.calls.filter((c) => c === "read:psizone")).toHaveLength(3);
		expect(source.recorded).toEqual([{ tenant: "psizone", delta: { ...ZERO, messages: 1 } }]);
	});

	it("a turn the service cannot take is a failure the engine reports", async () => {
		const source = new FakeSource();
		source.failing = true;
		await expect(visitorAssistantPort(source).record("psizone", ZERO)).rejects.toThrow(
			"could not be asked",
		);
	});

	it("the booking page may offer a call back unless the organisation said no; when it cannot say, it may", async () => {
		const source = new FakeSource();
		expect(await visitorAssistantPort(source).callbackOffered("psizone")).toBe(true);
		source.with({ booking: { horizonDays: 30, offerCallback: false } });
		expect(await visitorAssistantPort(source).callbackOffered("psizone")).toBe(false);
		source.answer = undefined;
		expect(await visitorAssistantPort(source).callbackOffered("psizone")).toBe(true);
		source.failing = true;
		expect(await visitorAssistantPort(source).callbackOffered("psizone")).toBe(true);
	});

	it("the call-back answer shares the guide's read: one call to the service within its time", async () => {
		const source = new FakeSource().with({ booking: { horizonDays: 30, offerCallback: false } });
		const port = visitorAssistantPort(source);
		await port.read("psizone");
		expect(await port.callbackOffered("psizone")).toBe(false);
		expect(source.calls).toEqual(["read:psizone"]);
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
		const store = new FakeSource().with({ enabled: false });
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
		const store = new FakeSource().with({ enabled: false });
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
