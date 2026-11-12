import { AI_SETTINGS_DEFAULTS, BEHAVIOUR_DEFAULTS } from "@psi/cms-client";
import { describe, expect, it } from "vitest";
import { chipsWith } from "../components/studio/copy-card";
import { changedSites } from "../globals/ai-settings";
import { diffSettings, sameSettings } from "./diff";
import { StudioSettings, snapshotSettings, studioSettingsOf } from "./settings";

const { updatedBy: _by, updatedAt: _at, ...BASE } = AI_SETTINGS_DEFAULTS;

describe("the studio's settings", () => {
	it("refuses, on the way in, a model off the allow-list and instructions over the limit", () => {
		expect(StudioSettings.safeParse(BASE).success).toBe(true);
		const model = { ...BASE, behaviour: { ...BEHAVIOUR_DEFAULTS, model: "acme/other" } };
		expect(StudioSettings.safeParse(model).success).toBe(false);
		const long = {
			...BASE,
			behaviour: { ...BEHAVIOUR_DEFAULTS, extraInstructions: "a".repeat(1501) },
		};
		expect(StudioSettings.safeParse(long).success).toBe(false);
	});

	it("reads a brand's group without its stamps, and a stored snapshot the same way", () => {
		const raw = {
			psizone: { ...AI_SETTINGS_DEFAULTS, updatedBy: "Ana", updatedAt: "2026-11-12T10:00:00.000Z" },
		};
		expect(studioSettingsOf(raw, "psizone")).toEqual(BASE);
		expect(studioSettingsOf(raw, "eqsync")).toBeNull();
		expect(snapshotSettings(BASE, "eqsync")).toEqual(BASE);
		expect(snapshotSettings("garbage", "blog")).toEqual(BASE);
	});
});

describe("diffSettings", () => {
	it("names each changed field, and nothing for the same settings", () => {
		const after = {
			...BASE,
			screeningLevel: "strict" as const,
			behaviour: {
				...BEHAVIOUR_DEFAULTS,
				style: { ...BEHAVIOUR_DEFAULTS.style, warmth: "low" as const },
				copy: { ro: { welcome: "Bună ziua." }, en: {} },
				focusTopics: ["ADHD", "Logopedie"],
			},
		};
		const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path);
		expect([...diffSettings(BASE, after)].sort(byPath)).toEqual(
			[
				{ path: "screeningLevel", before: "standard", after: "strict" },
				{ path: "behaviour.style.warmth", before: "high", after: "low" },
				{ path: "behaviour.copy.ro.welcome", before: "", after: "Bună ziua." },
				{ path: "behaviour.focusTopics", before: "", after: "ADHD · Logopedie" },
			].sort(byPath),
		);
		expect(sameSettings(BASE, { ...BASE })).toBe(true);
		expect(sameSettings(BASE, after)).toBe(false);
	});

	it("reads an unset line and an empty one alike, and diffs against nothing as all new", () => {
		const blank = { ...BASE, behaviour: { ...BEHAVIOUR_DEFAULTS, copy: { ro: {}, en: {} } } };
		expect(diffSettings(BASE, blank)).toEqual([]);
		expect(diffSettings(null, BASE).length).toBeGreaterThan(5);
	});
});

describe("changedSites", () => {
	const doc = (psizone: unknown, eqsync: unknown = BASE) => ({ psizone, eqsync });

	it("sees a behaviour change on its own brand only", () => {
		const changed = { ...BASE, behaviour: { ...BEHAVIOUR_DEFAULTS, creativity: "precise" } };
		expect(changedSites(doc(BASE), doc(changed))).toEqual(["psizone"]);
	});

	it("never counts a behaviour that differs only in key order or blank lines", () => {
		const reordered = {
			...BASE,
			// The same values, its keys in reverse order, and a line left blank.
			behaviour: {
				...Object.fromEntries(Object.entries(BEHAVIOUR_DEFAULTS).reverse()),
				copy: { en: {}, ro: { welcome: "" } },
			},
		};
		expect(changedSites(doc(BASE), doc(reordered))).toEqual([]);
	});

	it("still sees the plain settings, and a group with no behaviour at all", () => {
		const { behaviour: _b, ...old } = BASE;
		expect(changedSites(doc(old), doc({ ...old, guideEnabled: false }))).toEqual(["psizone"]);
		expect(changedSites(doc(old), doc(old))).toEqual([]);
	});
});

describe("chipsWith", () => {
	const own = ["A?", "B?", "C?"];
	it("keeps all three, the site's where none was typed, and none when all are the site's", () => {
		expect(chipsWith(undefined, own, 1, "X?")).toEqual(["A?", "X?", "C?"]);
		expect(chipsWith(["A?", "X?", "C?"], own, 1, undefined)).toBeUndefined();
		expect(chipsWith(undefined, own, 0, "  ")).toBeUndefined();
		expect(chipsWith(undefined, [], 2, "Z?")).toEqual(["Z?"]);
	});
});
