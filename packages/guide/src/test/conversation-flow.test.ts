import {
	BUNDLED_LANGUAGES,
	createLanguageDetector,
	type EngineEvent,
	type HistoryTurn,
} from "@psi/engine";
import { answerText, collect, MemorySchedulingStore, shape } from "@psi/engine/testing";
import { afterEach, describe, expect, it } from "vitest";
import type { Brand, Locale } from "../contract";
import { PSI_PROFILES } from "../index";
import { passage, source } from "./fake-knowledge";
import { closeAll, startGuide } from "./harness";

afterEach(closeAll);

const languages = createLanguageDetector(BUNDLED_LANGUAGES);

interface Turn {
	question: string;
	/** What the fake model writes for it (in the page's language). */
	reply: string;
	/** True when the reply states facts from a tool result, cited. */
	cites?: boolean;
}

/** A conversation as visitors hold it: greeting, test, gibberish, a feeling, meta, facts, price, thanks. */
function script(locale: Locale, fact: { question: string; reply: string }): ReadonlyArray<Turn> {
	return locale === "ro"
		? [
				{ question: "salut", reply: "Bună, mă bucur că ai scris. Cu ce te pot ajuta azi?" },
				{
					question: "test",
					reply: "Totul merge, mesajul tău a ajuns la mine. Ce ai vrea să afli?",
				},
				{
					question: "qwe",
					reply: "Cred că a fost o greșeală de tastare; te refereai la ceva anume?",
				},
				{
					question: "sunt cam trist azi",
					reply:
						"Îmi pare rău că azi e greu, e firesc să fie și zile așa. Dacă vrei, îți spun ce putem face pentru tine.",
				},
				{
					question: "ce faceti voi?",
					reply: "Te ajut să găsești ce te interesează în paginile noastre; întreabă-mă orice.",
				},
				{ question: fact.question, reply: fact.reply, cites: true },
				{
					question: "cat costa?",
					reply: "Nu vreau să-ți spun un preț greșit; echipa îți răspunde din pagina de contact.",
				},
				{ question: "ok mersi", reply: "Cu drag, sunt aici dacă mai ai o întrebare." },
			]
		: [
				{ question: "hi", reply: "Hello, I'm glad you wrote. What can I help with today?" },
				{
					question: "test",
					reply: "All working, your message reached me. What would you like to know?",
				},
				{ question: "qwe", reply: "That looks like a typo; did you mean something in particular?" },
				{
					question: "I feel a bit sad today",
					reply:
						"I'm sorry today feels heavy; days like that happen. If you like, I can tell you what we can do for you.",
				},
				{
					question: "what do you do?",
					reply: "I help you find what you need in our pages; ask me anything.",
				},
				{ question: fact.question, reply: fact.reply, cites: true },
				{
					question: "how much does it cost?",
					reply: "I'd rather not guess a price; the team can tell you through the contact page.",
				},
				{ question: "ok thanks", reply: "You're welcome, I'm here if anything else comes up." },
			];
}

const FACT = source("fact", "Reviewed page");
const FACTS: Readonly<
	Record<Brand, Record<Locale, { question: string; reply: string; passage: string }>>
> = {
	psizone: {
		ro: {
			question: "Ce date cere formularul?",
			reply: "Formularul cere doar numele și un telefon sau un e-mail [1].",
			passage: "Formularul cere doar numele și un telefon sau un e-mail.",
		},
		en: {
			question: "What does the form ask for?",
			reply: "The form asks only for your name and a phone or an email [1].",
			passage: "The form asks only for your name and a phone or an email.",
		},
	},
	eqsync: {
		ro: {
			question: "Ce căști îmi trebuie?",
			reply: "Orice căști cu stânga și dreapta separate sunt bune [1].",
			passage: "Orice căști cu stânga și dreapta separate sunt bune.",
		},
		en: {
			question: "What headphones do I need?",
			reply: "Any headphones with separate left and right sides will do [1].",
			passage: "Any headphones with separate left and right sides will do.",
		},
	},
	hemisync: {
		ro: {
			question: "Ce sunt nivelurile Focus?",
			reply: "Nivelurile Focus sunt nume date unor stări de conștiință [1].",
			passage: "Nivelurile Focus sunt nume date unor stări de conștiință.",
		},
		en: {
			question: "What are the Focus levels?",
			reply: "The Focus levels are names given to states of consciousness [1].",
			passage: "The Focus levels are names given to states of consciousness.",
		},
	},
	blog: {
		ro: {
			question: "Cum sunt revizuite articolele?",
			reply: "Fiecare articol e citit de un clinician înainte să apară [1].",
			passage: "Fiecare articol e citit de un clinician înainte să apară.",
		},
		en: {
			question: "How are the articles reviewed?",
			reply: "Every article is read by a clinician before it goes out [1].",
			passage: "Every article is read by a clinician before it goes out.",
		},
	},
};

const BRANDS: ReadonlyArray<Brand> = ["psizone", "eqsync", "hemisync", "blog"];
const CASES = BRANDS.flatMap((brand) =>
	(["ro", "en"] as const).map((locale) => [brand, locale] as const),
);

describe("a scripted conversation, per brand and locale", () => {
	it.each(
		CASES,
	)("%s %s: every turn answered, in the locale, never twice the same", async (brand, locale) => {
		const fact = FACTS[brand][locale];
		const turns = script(locale, fact);
		const booking = brand === "psizone";
		const { guide } = await startGuide({
			brand,
			replies: turns.map((t) => ({ kind: "text", chunks: [t.reply] })),
			searches: [{ kind: "passages", passages: [passage(FACT, fact.passage)] }],
			...(booking ? { options: { scheduling: new MemorySchedulingStore() } } : {}),
		});
		const history: Array<HistoryTurn> = [];
		const replies: Array<string> = [];
		for (const turn of turns) {
			const events: ReadonlyArray<EngineEvent> = await collect(
				guide.ask({ question: turn.question, locale, history: [...history] }),
			);
			const kinds = shape(events);
			expect(kinds).not.toContain("refusal:unavailable");
			expect(kinds).not.toContain("refusal:no_content");
			const text = answerText(events);
			expect(text.length).toBeGreaterThan(0);
			expect(languages.isOther(text, locale)).toBe(false);
			if (turn.cites === true) expect(kinds).toContain("sources");
			replies.push(text);
			history.push({ role: "user", text: turn.question }, { role: "guide", text });
		}
		for (let i = 1; i < replies.length; i += 1) expect(replies[i]).not.toBe(replies[i - 1]);
		if (booking) {
			const offer = await collect(
				guide.ask({
					question: locale === "ro" ? "vreau o programare" : "I want to book an appointment",
					locale,
					history,
				}),
			);
			expect(shape(offer)).toEqual(["booking", "done"]);
		}
	});

	it("a reply identical to the previous one is regenerated", async () => {
		const same = "Cu drag, sunt aici dacă mai ai o întrebare.";
		const { guide } = await startGuide({
			brand: "blog",
			replies: [
				{ kind: "text", chunks: [same] },
				{ kind: "text", chunks: [same] },
				{ kind: "text", chunks: ["Mă bucur că ți-a folosit. Ce ai vrea să citești mai departe?"] },
			],
			autoSearch: false,
		});
		const first = answerText(await collect(guide.ask({ question: "mersi", locale: "ro" })));
		const second = answerText(
			await collect(
				guide.ask({
					question: "ok mersi",
					locale: "ro",
					history: [
						{ role: "user", text: "mersi" },
						{ role: "guide", text: first },
					],
				}),
			),
		);
		expect(first).toBe(same);
		expect(second).not.toBe(first);
	});

	it.each([
		["te pot ghidesc", "Salut! Te pot ghidesc spre pagina potrivită."],
		["îmi pare că", "Îmi pare că ești trist azi. Sunt aici."],
		["ghidesc", "Spune-mi ce te interesează și te ghidesc spre pagina potrivită."],
	])("a Romanian grammar slip (%s) is regenerated", async (_slip, wrong) => {
		const right = "Îmi pare rău că ești trist azi. Sunt aici dacă vrei să vorbim.";
		const { guide, server } = await startGuide({
			brand: "eqsync",
			replies: [
				{ kind: "text", chunks: [wrong] },
				{ kind: "text", chunks: [right] },
			],
			autoSearch: false,
		});
		const events = await collect(guide.ask({ question: "sunt cam trist azi", locale: "ro" }));
		expect(answerText(events)).toBe(right);
		expect(JSON.stringify(server.requests[1]?.body)).toContain("greșeală de gramatică");
	});

	it("tells EQ-SYNC there are no meetings, and no brand to close every reply with a question", () => {
		const eq = PSI_PROFILES.eqsync.locales.ro;
		expect(eq?.policy.join(" ")).toContain("nu există întâlniri");
		for (const profile of Object.values(PSI_PROFILES)) {
			for (const locale of Object.values(profile.locales)) {
				expect(locale.voice).not.toMatch(/prima întâlnire|first meeting/);
			}
		}
	});
});
