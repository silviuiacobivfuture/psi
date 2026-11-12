import { describe, expect, it } from "vitest";
import {
	AiBehaviour,
	BEHAVIOUR_DEFAULTS,
	behaviourFrom,
	CHIPS,
	EXTRA_INSTRUCTIONS_MAX,
	GUIDE_MODELS,
	guideCopyFor,
	presetOf,
	TONE_PRESETS,
	TOPICS_MAX,
} from "./ai-behaviour";

describe("behaviourFrom", () => {
	it.each([undefined, null, "x", 1, [], {}])("is today's behaviour for %j", (raw) => {
		expect(behaviourFrom(raw)).toEqual(BEHAVIOUR_DEFAULTS);
	});

	it("keeps a full, valid behaviour as it is", () => {
		const full = AiBehaviour.parse({
			version: 1,
			style: { warmth: "low", length: "short", formality: "formal", followUps: "often" },
			extraInstructions: "Vorbește despre evaluare.",
			copy: {
				ro: {
					welcome: "Bună ziua.",
					chips: ["A?", "B?", "C?"],
					outOfScope: "Un specialist.",
					unknown: "Nu e pe site.",
					exchangeLimit: "Pe mâine.",
				},
				en: { welcome: "Hello." },
			},
			focusTopics: ["evaluare"],
			avoidTopics: ["prețuri"],
			contactRoute: "phone",
			model: GUIDE_MODELS[1],
			creativity: "creative",
		});
		expect(behaviourFrom(full)).toEqual(full);
	});

	it("defaults each unreadable field on its own and keeps the rest", () => {
		const b = behaviourFrom({
			style: { warmth: "boiling", length: "long" },
			extraInstructions: 7,
			copy: { ro: { welcome: "  ", chips: ["Unu?", "", 3, "Doi?", "Trei?", "Patru?"] }, en: "x" },
			focusTopics: ["somn", "Somn", " căști ", "x".repeat(61)],
			contactRoute: "fax",
			model: "acme/unknown",
			creativity: "wild",
		});
		expect(b).toEqual({
			...BEHAVIOUR_DEFAULTS,
			style: { ...BEHAVIOUR_DEFAULTS.style, length: "long" },
			copy: { ro: { chips: ["Unu?", "Doi?", "Trei?"] }, en: {} },
			focusTopics: ["somn", "căști"],
		});
	});

	it("caps the instructions, the chips and the topics", () => {
		const b = behaviourFrom({
			extraInstructions: "a".repeat(EXTRA_INSTRUCTIONS_MAX + 10),
			copy: { ro: { chips: ["1", "2", "3", "4"] } },
			focusTopics: Array.from({ length: TOPICS_MAX + 3 }, (_, i) => `t${i}`),
		});
		expect(b.extraInstructions).toHaveLength(EXTRA_INSTRUCTIONS_MAX);
		expect(b.copy.ro.chips).toHaveLength(CHIPS);
		expect(b.focusTopics).toHaveLength(TOPICS_MAX);
	});
});

describe("presets", () => {
	it("recognises each preset and a mix of the owner's own", () => {
		for (const [name, style] of Object.entries(TONE_PRESETS)) expect(presetOf(style)).toBe(name);
		expect(presetOf(BEHAVIOUR_DEFAULTS.style)).toBe("warm");
		expect(presetOf({ ...TONE_PRESETS.calm, length: "long" })).toBeNull();
	});
});

describe("guideCopyFor", () => {
	it("gives only what the studio set, per locale, and nothing without settings", () => {
		const b = behaviourFrom({ copy: { ro: { welcome: "Salut!" } } });
		expect(guideCopyFor(b, "ro")).toEqual({ welcome: "Salut!" });
		expect(guideCopyFor(b, "en")).toEqual({});
		expect(guideCopyFor(null, "ro")).toEqual({});
	});
});
