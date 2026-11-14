import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answerText, collect, MemorySchedulingStore } from "@psi/engine/testing";
import { createKnowledge, createLexicalEmbedder, type KnowledgeStore } from "@psi/knowledge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BookingOffer, createPsiEngine, PSI_PROFILES } from "../index";
import { closeAll, startGuide } from "./harness";

/**
 * Per-app isolation in the guide: a profile's scheduling tools query ITS tenant and no other. The
 * store is a fake of the engine's port that records every call, holding free times and services
 * for BOTH tenants under the same service key, so a leak would show in the answer.
 */

const H = 3_600_000;
let dir: string;
let kb: KnowledgeStore;

beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	vi.stubEnv("CHROMA_URL", "");
	dir = mkdtempSync(join(tmpdir(), "psi-tenants-"));
	kb = createKnowledge({ url: `file:${join(dir, "kb.db")}`, embedder: createLexicalEmbedder() });
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await closeAll();
	await kb.close();
	rmSync(dir, { recursive: true, force: true });
});

const WHO = { psizone: "DEMO Ana Psizone", hemisync: "DEMO Dan Hemi-Sync" } as const;

function slotsFor(who: string, tag: string) {
	const day = Math.ceil(Date.now() / (24 * H)) * 24 * H;
	return [1, 2, 3].map((d) => ({
		id: `${tag}${d}`,
		start: day + d * 24 * H + 7 * H,
		end: day + d * 24 * H + 8 * H,
		practitionerName: who,
		modes: ["onsite" as const],
	}));
}

/** A store with a "session" service in both tenants, each with its own people and times. */
function bothTenants(): { port: MemorySchedulingStore; asked: string[] } {
	const asked: string[] = [];
	const port = new MemorySchedulingStore()
		.offer("psizone", "session", slotsFor(WHO.psizone, "pz"))
		.offer("hemisync", "session", slotsFor(WHO.hemisync, "hs"));
	port.catalogue = async (tenant) => {
		asked.push(tenant);
		return tenant === "psizone" || tenant === "hemisync" ? [{ slug: "session" }] : [];
	};
	return { port, asked };
}

const OTHER = { psizone: "hemisync", hemisync: "psizone" } as const;

describe.each(["psizone", "hemisync"] as const)("the %s profile's scheduling tools", (brand) => {
	it("query its own tenant for the catalogue and the free times, and show only its own people", async () => {
		const { port, asked } = bothTenants();
		const guide = createPsiEngine({ knowledge: kb, scheduling: port }).guide(brand);
		const events = await collect(guide.ask({ question: "Vreau o programare", locale: "ro" }));
		const offer = events.find((e) => e.type === "booking")?.offer as BookingOffer | undefined;
		expect(offer?.kind).toBe("times");
		expect(offer?.status).toBe("ok");
		expect(offer?.slots.length).toBeGreaterThan(0);
		for (const slot of offer?.slots ?? []) {
			expect(slot.practitioner).toBe(WHO[brand]);
			expect(slot.practitioner).not.toBe(WHO[OTHER[brand]]);
		}
		expect(asked).not.toHaveLength(0);
		expect(new Set(asked)).toEqual(new Set([brand]));
		const searches = port.calls.flatMap((c) => (c.method === "findSlots" ? [c.search] : []));
		expect(searches).not.toHaveLength(0);
		for (const search of searches) expect(search.tenant).toBe(brand);
	});

	it("never reaches the other tenant when its own has no services: the callback form stands", async () => {
		const { port, asked } = bothTenants();
		port.catalogue = async (tenant) => {
			asked.push(tenant);
			return tenant === OTHER[brand] ? [{ slug: "session" }] : [];
		};
		const guide = createPsiEngine({ knowledge: kb, scheduling: port }).guide(brand);
		const events = await collect(guide.ask({ question: "Vreau o programare", locale: "ro" }));
		const offer = events.find((e) => e.type === "booking")?.offer as BookingOffer | undefined;
		expect(offer?.status).toBe("unavailable");
		expect(offer?.slots).toEqual([]);
		expect(new Set(asked)).toEqual(new Set([brand]));
		expect(port.calls.filter((c) => c.method === "findSlots")).toHaveLength(0);
	});
});

describe("the brands that do not schedule", () => {
	it.each([
		"eqsync",
		"blog",
	] as const)("%s never asks the store, whatever the visitor says", async (brand) => {
		const { port, asked } = bothTenants();
		const guide = createPsiEngine({ knowledge: kb, scheduling: port }).guide(brand);
		expect(guide.scheduling).toBeUndefined();
		await collect(guide.ask({ question: "Vreau o programare", locale: "ro" }));
		expect(port.calls).toEqual([]);
		expect(asked).toEqual([]);
	});
});

describe("the blog hands a booking to the site that owns the page", () => {
	const HEMI_PAGE = {
		kind: "article",
		status: "published",
		title: "Ce este Focus 10",
		url: "/articole/ce-este-focus-10",
		brand: "hemisync",
		clinical: false,
		headings: [],
	} as const;

	async function handoff(
		question: string,
		page?:
			| typeof HEMI_PAGE
			| (Omit<typeof HEMI_PAGE, "brand" | "clinical"> & { brand: string; clinical: boolean }),
	) {
		const { guide, server } = await startGuide({ brand: "blog", autoSearch: false });
		const events = await collect(guide.ask({ question, locale: "ro", ...(page ? { page } : {}) }));
		expect(server.requests).toHaveLength(0);
		const action = events.find((e) => e.type === "actions")?.actions[0];
		return { text: answerText(events), action };
	}

	it("a Hemi-Sync article: Hemi-Sync's own booking page, with Hemi-Sync's words and none of Psizone's numbers", async () => {
		const { text, action } = await handoff("Vreau să programez o sesiune", HEMI_PAGE);
		expect(action?.kind).toBe("link");
		const href = action?.kind === "link" ? action.href : "";
		expect(new URL(href).pathname).toBe("/programare");
		expect(href).not.toContain("ghid=programare");
		expect(action?.kind === "link" ? action.label : "").toBe("Programează o sesiune Hemi-Sync");
		expect(text).toContain("Hemi-Sync România");
		expect(text).not.toContain("0748 017 752");
		expect(text).not.toContain("Psizone");
	});

	it("in English it links Hemi-Sync's English booking page", async () => {
		const { guide } = await startGuide({ brand: "blog", autoSearch: false });
		const events = await collect(
			guide.ask({ question: "I'd like to book a session", locale: "en", page: HEMI_PAGE }),
		);
		const action = events.find((e) => e.type === "actions")?.actions[0];
		expect(new URL(action?.kind === "link" ? action.href : "").pathname).toBe("/en/booking");
	});

	it("a Psizone article, a page of no brand, and an EQ-SYNC article keep going to Psizone's chat", async () => {
		for (const page of [
			{ ...HEMI_PAGE, brand: "psizone" },
			{ ...HEMI_PAGE, brand: "eqsync" },
			undefined,
		]) {
			const { text, action } = await handoff("Vreau să programez o sesiune", page);
			const href = action?.kind === "link" ? action.href : "";
			expect(href).toContain("?ghid=programare");
			expect(text).toContain("0748 017 752");
		}
	});

	it("a clinical Hemi-Sync page, or a clinical question on one, still goes to Psizone", async () => {
		const page = await handoff("Vreau să programez o sesiune", { ...HEMI_PAGE, clinical: true });
		expect(page.action?.kind === "link" ? page.action.href : "").toContain("?ghid=programare");
		const question = await handoff("Vreau o programare pentru copilul meu cu anxietate", HEMI_PAGE);
		expect(question.action?.kind === "link" ? question.action.href : "").toContain(
			"?ghid=programare",
		);
	});
});

describe("Hemi-Sync's guide never gives another site's phone numbers", () => {
	it("knows no published phone and says to use the contact page", () => {
		for (const locale of ["ro", "en"] as const) {
			const words = PSI_PROFILES.hemisync.locales[locale];
			expect(words?.facts ?? []).toEqual([]);
			expect(words?.handoff).toBeUndefined();
			const all = [words?.voice, ...(words?.policy ?? [])].join("\n");
			expect(all).not.toMatch(/0748 017 752|0752 466 792/);
		}
	});

	it("while Psizone's, the blog's and EQ-SYNC's still know the centre's", () => {
		for (const brand of ["psizone", "blog", "eqsync"] as const) {
			expect(PSI_PROFILES[brand].locales.ro?.facts?.join(" ")).toContain("0748 017 752");
		}
	});
});
