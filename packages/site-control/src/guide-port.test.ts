import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	AI_SETTINGS_DEFAULTS,
	BEHAVIOUR_DEFAULTS,
	createControlClient,
	settingsFor,
	type TestAnswerLine,
} from "@psi/cms-client";
import { createGuide, readBehaviour } from "@psi/guide";
import { createKnowledge, createLexicalEmbedder, type KnowledgeStore } from "@psi/knowledge";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countingGuide } from "./guide-port";
import { mountSiteControl } from "./mount";

const SECRET = "c".repeat(40);
let dir: string;
let kb: KnowledgeStore;

beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	vi.stubEnv("CHROMA_URL", "");
	dir = mkdtempSync(join(tmpdir(), "psi-guide-port-"));
	kb = createKnowledge({ url: `file:${join(dir, "kb.db")}`, embedder: createLexicalEmbedder() });
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await kb.close();
	rmSync(dir, { recursive: true, force: true });
});

const COPY = {
	welcome: "Bun venit.",
	chips: ["Unu?", "Doi?", "Trei?"],
	outOfScope: "Asta o lămurim cu un specialist.",
	unknown: "Nu avem asta pe site.",
	exchangeLimit: "Continuăm mâine.",
};

function site(guideCopy = true) {
	const app = new Hono();
	const guide = countingGuide(createGuide({ brand: "eqsync", knowledge: kb }));
	mountSiteControl(app, {
		brand: "eqsync",
		env: { PSI_CONTROL_SECRET: SECRET },
		guide,
		scheduling: { state: "not_configured" },
		staffLink: () => ({ group: "Echipa", label: "Administrare", hint: "Panoul" }),
		...(guideCopy ? { guideCopy: () => COPY } : {}),
	});
	const client = createControlClient({
		origin: "http://localhost:4320",
		secret: SECRET,
		fetch: async (input, init) => app.request(String(input), init),
	});
	return { client, guide };
}

async function lines(r: Awaited<ReturnType<ReturnType<typeof site>["client"]["ask"]>>) {
	if (!r.ok) throw new Error(r.problem);
	const out: TestAnswerLine[] = [];
	for await (const l of r.data) out.push(l);
	return out;
}

describe("the studio's preview, through the CMS's client", () => {
	it("answers with the draft for that one answer, then with the live settings again", async () => {
		const { client, guide } = site();
		const draft = { ...AI_SETTINGS_DEFAULTS, guideEnabled: false };
		const off = await lines(await client.ask({ question: "salut", locale: "ro", draft }, "7"));
		expect(off[0]).toEqual({ type: "meta", draftApplied: true, model: guide.model });
		expect(off).toContainEqual({ type: "refusal", reason: "unavailable" });
		expect(off.at(-2)).toMatchObject({ type: "timing" });
		expect(off.at(-1)).toEqual({ type: "done" });
		const live = await lines(await client.ask({ question: "salut", locale: "ro" }, "7"));
		expect(live[0]).toEqual({ type: "meta", draftApplied: false, model: guide.model });
		expect(live.some((l) => l.type === "text")).toBe(true);
		expect(live).not.toContainEqual({ type: "refusal", reason: "unavailable" });
		// Staff previews are never counted as visitors' questions.
		expect(guide.today()).toEqual({ asked: 0, unanswered: 0 });
	});

	it("names the draft's model and takes the conversation so far", async () => {
		const { client } = site();
		const draft = { behaviour: { ...BEHAVIOUR_DEFAULTS, model: "google/gemini-3.1-flash-lite" } };
		const out = await lines(
			await client.ask(
				{ question: "și deci?", locale: "ro", draft, history: [{ role: "user", text: "salut" }] },
				"7",
			),
		);
		expect(out[0]).toEqual({
			type: "meta",
			draftApplied: true,
			model: "google/gemini-3.1-flash-lite",
		});
	});

	it("tells the studio the site's built-in copy, and nothing when the site gives none", async () => {
		const withCopy = await site().client.agent("7");
		if (!withCopy.ok) throw new Error(withCopy.problem);
		expect(withCopy.data.copyDefaults).toEqual({ ro: COPY, en: COPY });
		const without = await site(false).client.agent("7");
		if (!without.ok) throw new Error(without.problem);
		expect(without.data.copyDefaults).toBeUndefined();
	});
});

describe("the CMS's behaviour, as the engine reads it", () => {
	it("survives the trip: every field the engine uses keeps its value", () => {
		const settings = settingsFor(
			{
				eqsync: {
					behaviour: {
						version: 1,
						style: { warmth: "low", length: "long", formality: "formal", followUps: "never" },
						extraInstructions: "Spune mereu că programul e gratuit 21 de zile.",
						copy: { ro: { ...COPY }, en: { unknown: "Not on our site." } },
						focusTopics: ["somn", "căști"],
						avoidTopics: ["prețuri"],
						contactRoute: "contact",
						model: "google/gemini-3.1-flash-lite",
						creativity: "precise",
					},
				},
			},
			"eqsync",
		);
		if (settings === null) throw new Error("unreadable");
		expect(readBehaviour(settings.behaviour)).toEqual({
			style: { warmth: "low", length: "long", formality: "formal", followUps: "never" },
			extraInstructions: "Spune mereu că programul e gratuit 21 de zile.",
			focusTopics: ["somn", "căști"],
			avoidTopics: ["prețuri"],
			contactRoute: "contact",
			model: "google/gemini-3.1-flash-lite",
			creativity: "precise",
			copy: {
				ro: { unknown: COPY.unknown, outOfScope: COPY.outOfScope },
				en: { unknown: "Not on our site." },
			},
		});
	});

	it("reads the defaults as the engine's defaults: no model, no route, no notes", () => {
		const b = readBehaviour(BEHAVIOUR_DEFAULTS);
		expect(b).toMatchObject({ extraInstructions: "", focusTopics: [], avoidTopics: [] });
		expect(b.model).toBeUndefined();
		expect(b.contactRoute).toBeUndefined();
	});
});
