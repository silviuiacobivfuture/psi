import { describe, expect, it, vi } from "vitest";
import { BEHAVIOUR_DEFAULTS } from "./ai-behaviour";
import {
	AI_SETTINGS_DEFAULTS,
	ANNOUNCE_REREAD_MS,
	createAiSettingsClient,
	liveGuideCopy,
	settingsFor,
} from "./ai-settings";

const group = {
	embeddings: "lexical",
	embedModel: "openai/text-embedding-3-large",
	deepSearch: true,
	guideEnabled: false,
	exchangeLimit: 30,
	exchangeWindowHours: 12,
	screeningLevel: "strict",
	updatedBy: "Ana",
	updatedAt: "2026-11-12T10:00:00.000Z",
};

describe("settingsFor", () => {
	it("reads one site's group, today's behaviour when the group has none", () => {
		expect(settingsFor({ blog: group }, "blog")).toEqual({
			...group,
			behaviour: BEHAVIOUR_DEFAULTS,
		});
	});
	it("never turns a group unreadable over its behaviour (a newer CMS, a model this site lacks)", () => {
		const s = settingsFor(
			{
				blog: {
					...group,
					behaviour: { version: 2, model: "acme/future", style: { warmth: "low" } },
				},
			},
			"blog",
		);
		expect(s?.guideEnabled).toBe(false);
		expect(s?.behaviour).toEqual({
			...BEHAVIOUR_DEFAULTS,
			style: { ...BEHAVIOUR_DEFAULTS.style, warmth: "low" },
		});
	});
	it("is null for a group this key may not read", () => {
		expect(settingsFor({ blog: group }, "psizone")).toBeNull();
	});
	it("fills blank fields with the defaults and refuses a model off the allow-list", () => {
		expect(settingsFor({ eqsync: { guideEnabled: false } }, "eqsync")).toEqual({
			...AI_SETTINGS_DEFAULTS,
			guideEnabled: false,
		});
		expect(settingsFor({ eqsync: { embedModel: "evil/model" } }, "eqsync")).toBeNull();
	});
	it("defaults to 20 exchanges a day and refuses limits out of range", () => {
		expect(settingsFor({ blog: {} }, "blog")).toMatchObject({
			exchangeLimit: 20,
			exchangeWindowHours: 24,
		});
		expect(settingsFor({ blog: { exchangeLimit: 0 } }, "blog")).toBeNull();
		expect(settingsFor({ blog: { exchangeLimit: 201 } }, "blog")).toBeNull();
		expect(settingsFor({ blog: { exchangeWindowHours: 169 } }, "blog")).toBeNull();
		expect(settingsFor({ blog: { exchangeLimit: 2.5 } }, "blog")).toBeNull();
	});
	it("defaults screening to standard and refuses an unknown level", () => {
		expect(settingsFor({ blog: {} }, "blog")?.screeningLevel).toBe("standard");
		expect(settingsFor({ blog: { screeningLevel: "off" } }, "blog")).toBeNull();
	});
});

describe("createAiSettingsClient", () => {
	function setup(answers: Array<Response | Error>) {
		let t = 0;
		let calls = 0;
		const fake: typeof fetch = async (_url, init) => {
			calls++;
			expect(new Headers(init?.headers).get("authorization")).toBe("users API-Key k");
			const a = answers.shift();
			if (a === undefined || a instanceof Error) throw a ?? new Error("none");
			return a;
		};
		const client = createAiSettingsClient({
			cmsUrl: "http://cms.test",
			apiKey: "k",
			site: "blog",
			fetch: fake,
			now: () => t,
		});
		return { client, tick: (ms: number) => (t += ms), calls: () => calls };
	}
	const ok = () => new Response(JSON.stringify({ blog: group }), { status: 200 });

	it("caches for 60 s", async () => {
		const s = setup([ok(), ok()]);
		expect((await s.client.get()).embeddings).toBe("lexical");
		s.tick(59_000);
		await s.client.get();
		expect(s.calls()).toBe(1);
		s.tick(2_000);
		await s.client.get();
		expect(s.calls()).toBe(2);
	});
	it("keeps the last known settings when the CMS fails", async () => {
		const s = setup([ok(), new Response("x", { status: 503 })]);
		await s.client.get();
		s.tick(61_000);
		expect((await s.client.get()).embedModel).toBe("openai/text-embedding-3-large");
	});
	it("falls back to the defaults when nothing was ever known", async () => {
		const s = setup([new Error("down")]);
		expect(await s.client.get()).toEqual(AI_SETTINGS_DEFAULTS);
	});
	it("re-reads after invalidate", async () => {
		const s = setup([ok(), ok()]);
		await s.client.get();
		s.client.invalidate();
		await s.client.get();
		expect(s.calls()).toBe(2);
	});
	it("re-reads at once after an announcement, and once more after the CMS's save commits", async () => {
		vi.useFakeTimers();
		try {
			const s = setup([ok(), ok(), ok()]);
			await s.client.get();
			await s.client.refreshAfterAnnounce();
			expect(s.calls()).toBe(2);
			await vi.advanceTimersByTimeAsync(ANNOUNCE_REREAD_MS);
			expect(s.calls()).toBe(3);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("liveGuideCopy", () => {
	const defaults = {
		welcome: "Bună.",
		chips: ["A?", "B?", "C?"],
		outOfScope: "Specialist.",
		unknown: "Nu e pe site.",
		exchangeLimit: "Pe mâine.",
	};
	it("is the site's own copy without a client, and the studio's lines over it with one", async () => {
		expect(liveGuideCopy(null, "ro", defaults)).toEqual(defaults);
		const client = createAiSettingsClient({
			cmsUrl: "http://cms.test",
			apiKey: "k",
			site: "blog",
			fetch: async () =>
				new Response(
					JSON.stringify({
						blog: { ...group, behaviour: { copy: { ro: { welcome: "Salut!" } } } },
					}),
				),
		});
		// The first render never waits for the CMS: the built-in copy, while the read goes out.
		expect(liveGuideCopy(client, "ro", defaults)).toEqual(defaults);
		await client.get();
		expect(liveGuideCopy(client, "ro", defaults)).toEqual({ ...defaults, welcome: "Salut!" });
		expect(liveGuideCopy(client, "en", defaults)).toEqual(defaults);
	});
});
