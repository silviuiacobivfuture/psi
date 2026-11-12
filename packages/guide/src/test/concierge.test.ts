import type { EngineCatalog, EngineEvent, ServiceFact } from "@psi/engine";
import { answerText, chatBody, collect, MemorySchedulingStore, shape } from "@psi/engine/testing";
import { afterEach, describe, expect, it } from "vitest";
import { BRANDS, type Brand } from "../contract";
import { PSI_PROFILES } from "../profiles";
import { CLINICAL_NEEDS, NEEDS, ROUTES } from "../services/needs";
import { SERVICES } from "../services/registry";
import { psiServices } from "../services/services";
import { closeAll, startGuide } from "./harness";

afterEach(closeAll);

/** A catalog holding only the CMS offerings the test publishes. */
function catalogWith(
	offerings: ReadonlyArray<{ id: string; title: string; text: string }>,
): EngineCatalog {
	return {
		items: () =>
			offerings.map((o) => ({
				id: o.id,
				title: o.title,
				url: "/contact",
				kind: "operational",
				topic: "operational",
				chunks: 1,
			})),
		entry: (_scope, _locale, id) =>
			offerings
				.filter((o) => o.id === id)
				.map((o) => ({
					source: { id: o.id, title: o.title, url: "/contact", reviewedBy: null, reviewedAt: null },
					text: o.text,
					score: 1,
				})),
	};
}

function brandsOf(services: ReadonlyArray<ServiceFact>): ReadonlyArray<string> {
	return [...new Set(services.map((s) => s.brand))];
}

function actionsOf(events: ReadonlyArray<EngineEvent>) {
	return events.flatMap((e) => (e.type === "actions" ? e.actions : []));
}

describe("the routing policy table", () => {
	const none = psiServices({ bookingInChat: () => false });

	it("has a row for every brand and every need", () => {
		for (const brand of BRANDS) {
			for (const need of NEEDS) expect(ROUTES[brand][need]).toBeDefined();
		}
	});

	it("never routes a clinical need to Hemi-Sync, from any guide", () => {
		for (const brand of BRANDS) {
			for (const need of CLINICAL_NEEDS) expect(ROUTES[brand][need]).not.toContain("hemisync");
		}
	});

	it("keeps Psizone's guide to Psizone, and sends EQ-SYNC's clinical needs to Psizone", () => {
		for (const need of NEEDS) {
			for (const brand of ROUTES.psizone[need]) expect(brand).toBe("psizone");
		}
		for (const need of CLINICAL_NEEDS) expect(ROUTES.eqsync[need]).toEqual(["psizone"]);
		for (const need of CLINICAL_NEEDS) expect(ROUTES.hemisync[need]).toEqual([]);
	});

	it("routes the blog's visitor to the brand that fits", async () => {
		const asked = async (need: string) =>
			(await none.find({ profile: "blog", locale: "ro", need })).services;
		expect(brandsOf(await asked("child-development"))).toEqual(["psizone"]);
		expect(brandsOf(await asked("sleep-calm"))).toEqual(["eqsync", "psizone"]);
		expect(brandsOf(await asked("meditation-exploration"))).toEqual(["hemisync", "eqsync"]);
		for (const need of CLINICAL_NEEDS) {
			expect(brandsOf(await asked(need))).not.toContain("hemisync");
		}
	});

	it("gives no service at all for a need the brand does not serve, and says so", async () => {
		const found = await none.find({ profile: "hemisync", locale: "ro", need: "child-development" });
		expect(found.services).toEqual([]);
		expect(found.note).toContain("Nothing here fits");
		const psizone = await none.find({
			profile: "psizone",
			locale: "ro",
			need: "meditation-exploration",
		});
		expect(psizone.services).toEqual([]);
	});

	it("returns only registry services, and nothing for an unknown need", async () => {
		const known = new Set(SERVICES.map((s) => s.id).concat("psizone-contact"));
		for (const brand of BRANDS) {
			for (const need of NEEDS) {
				const found = await none.find({ profile: brand, locale: "en", need });
				for (const s of found.services) expect(known.has(s.id)).toBe(true);
			}
		}
		expect((await none.find({ profile: "blog", locale: "ro", need: "miracle" })).services).toEqual(
			[],
		);
	});
});

describe("recommendServices facts and prices", () => {
	it("carries a price only when the CMS published one for that service", async () => {
		const priced = psiServices({
			bookingInChat: () => false,
			catalog: catalogWith([
				{
					id: "cms.of.7.ro",
					title: "Evaluare inițială",
					text: "Evaluare inițială. Preț: 350 RON.",
				},
				{ id: "cms.of.8.ro", title: "Ceva fără preț", text: "Ceva fără preț. Descriere." },
			]),
		});
		const found = await priced.find({ profile: "psizone", locale: "ro", need: "evaluation" });
		const evaluation = found.services.find((s) => s.id === "psizone-evaluation");
		expect(evaluation?.price).toBe("Preț: 350 RON.");
		expect(found.note).toContain("only as returned");
		const speech = await priced.find({
			profile: "psizone",
			locale: "ro",
			need: "child-development",
		});
		expect(speech.services.find((s) => s.id === "psizone-speech")?.price).toBeUndefined();
	});

	it("says no price is published when the CMS has none, and a failing catalog is silent", async () => {
		const broken: EngineCatalog = {
			items: () => Promise.reject(new Error("cms down")),
			entry: () => [],
		};
		const found = await psiServices({ bookingInChat: () => false, catalog: broken }).find({
			profile: "psizone",
			locale: "ro",
			need: "evaluation",
		});
		expect(found.services.length).toBeGreaterThan(0);
		expect(found.services.every((s) => s.price === undefined)).toBe(true);
		expect(found.note).toContain("do not give one");
	});

	it("starts a booking in the chat where the site books, and hands over to Psizone's chat elsewhere", async () => {
		const chat = await psiServices({ bookingInChat: () => true }).find({
			profile: "psizone",
			locale: "ro",
			need: "child-development",
		});
		expect(chat.services[0]?.action).toMatchObject({ kind: "ask" });
		const blog = await psiServices({ bookingInChat: () => false }).find({
			profile: "blog",
			locale: "ro",
			need: "child-development",
		});
		const action = blog.services[0]?.action;
		expect(action?.kind).toBe("link");
		expect(action?.kind === "link" ? action.href : "").toContain("?ghid=programare");
	});

	it("EQ-SYNC's free programme is a link to its sign-up and says it is a wellness tool, not a treatment", async () => {
		const found = await psiServices({ bookingInChat: () => false }).find({
			profile: "eqsync",
			locale: "ro",
			need: "sleep-calm",
		});
		const free = found.services.find((s) => s.id === "eqsync-free");
		expect(free?.action).toMatchObject({ kind: "link", label: "Începe programul gratuit" });
		expect(found.note).toContain("not a medical device");
	});
});

describe("discovery to recommendation, through the guide with a scripted model", () => {
	const tool = (need: string) =>
		({ kind: "tool", query: "", tool: "recommendServices", input: { need } }) as const;

	it("recommends the speech service for a three-year-old who is not talking, with its button", async () => {
		const { guide, server } = await startGuide({
			autoSearch: false,
			options: { scheduling: new MemorySchedulingStore() },
			replies: [
				tool("child-development"),
				{
					kind: "text",
					chunks: [
						"Înțeleg, e firesc să te îngrijoreze când cel mic nu vorbește încă. Ți-aș recomanda Logopedia: pornim de la o evaluare, ca să vedem unde e copilul acum, iar prima discuție e despre voi, nu despre diagnostic. Prețul ți-l spune echipa la prima discuție.",
					],
				},
			],
		});
		const events = await collect(
			guide.ask({ question: "copilul meu de 3 ani nu vorbește", locale: "ro" }),
		);
		expect(shape(events)).toEqual(["thinking", "text", "actions", "done"]);
		expect(answerText(events)).toContain("Logopedia");
		expect(actionsOf(events)).toEqual([
			{ kind: "ask", label: "Începe programarea", text: "Vreau o programare pentru logopedie" },
		]);
		// The model was given the tool, and its result named the service.
		const tools = chatBody(server.requests[0]).tools?.map((t) => t.function.name) ?? [];
		expect(tools).toContain("recommendServices");
		expect(JSON.stringify(server.requests[1]?.body)).toContain("Logopedia");
	});

	it("asks one gentle question first when the situation is thin, and gives no button yet", async () => {
		const { guide } = await startGuide({
			autoSearch: false,
			replies: [
				{
					kind: "text",
					chunks: [
						"Mulțumesc că mi-ai spus. Pentru cine ai vrea să cauți ajutor: pentru tine, pentru un copil sau pentru un adolescent?",
					],
				},
			],
		});
		const events = await collect(guide.ask({ question: "am nevoie de ajutor", locale: "ro" }));
		expect(actionsOf(events)).toEqual([]);
		expect(answerText(events).match(/\?/g)).toHaveLength(1);
	});

	it("never carries a price the tool did not return: an invented one is left out", async () => {
		const { guide } = await startGuide({
			autoSearch: false,
			replies: [
				tool("evaluation"),
				{
					kind: "text",
					chunks: ["Evaluarea e primul pas. Costă 500 RON și durează două ore."],
				},
				{
					kind: "text",
					chunks: ["Evaluarea e primul pas, iar prețul ți-l spune echipa la prima discuție."],
				},
			],
		});
		const events = await collect(guide.ask({ question: "cât costă o evaluare?", locale: "ro" }));
		const text = answerText(events);
		expect(text).not.toContain("500");
		expect(text).toContain("Evaluarea");
	});

	it("leaves out a promise of outcome the tool never gave", async () => {
		const { guide } = await startGuide({
			autoSearch: false,
			replies: [
				tool("child-development"),
				{
					kind: "text",
					chunks: [
						"Logopedia e potrivită. Garantăm că vei vedea rezultate în 3 luni și copilul va fi vindecat.",
					],
				},
				{
					kind: "text",
					chunks: ["Logopedia e potrivită: pornim de la o evaluare și facem un plan."],
				},
			],
		});
		const events = await collect(guide.ask({ question: "copilul meu nu vorbește", locale: "ro" }));
		const text = answerText(events);
		expect(text).not.toMatch(/garant|vindecat|3 luni/i);
	});

	it("shows no button for a service the reply does not name", async () => {
		const { guide } = await startGuide({
			autoSearch: false,
			replies: [
				tool("child-development"),
				{ kind: "text", chunks: ["Spune-mi cât de mare e copilul."] },
			],
		});
		const events = await collect(guide.ask({ question: "copilul meu nu vorbește", locale: "ro" }));
		expect(actionsOf(events)).toEqual([]);
	});
});

describe("booking from a site that cannot book (the screenshot case)", () => {
	it("hands the blog's visitor over to Psizone's chat with the booking started, without asking the model", async () => {
		const { guide, server } = await startGuide({ brand: "blog", autoSearch: false });
		const events = await collect(
			guide.ask({ question: "poți să-mi faci o programare?", locale: "ro" }),
		);
		expect(server.requests).toHaveLength(0);
		expect(server.searches).toHaveLength(0);
		expect(shape(events)).toEqual(["text", "actions", "done"]);
		const text = answerText(events);
		expect(text).toContain("0748 017 752");
		expect(text).not.toMatch(/nu mi-a răspuns|pagina de contact/i);
		const [action] = actionsOf(events);
		expect(action?.kind).toBe("link");
		if (action?.kind === "link") {
			expect(action.href).toContain("?ghid=programare");
			expect(action.href).not.toContain("serviciu=");
			expect(action.label).toBe("Începe programarea");
		}
	});

	it("carries the service the visitor named", async () => {
		const { guide } = await startGuide({ brand: "blog", autoSearch: false });
		const events = await collect(
			guide.ask({ question: "Vreau o programare la logopedie", locale: "ro" }),
		);
		const [action] = actionsOf(events);
		expect(action?.kind === "link" ? action.href : "").toContain("serviciu=logopedie");
	});

	it("does the same in English, and from EQ-SYNC (which has no appointments of its own)", async () => {
		for (const brand of ["blog", "eqsync"] as const satisfies ReadonlyArray<Brand>) {
			const { guide, server } = await startGuide({ brand, autoSearch: false });
			const events = await collect(
				guide.ask({ question: "I'd like to book an appointment", locale: "en" }),
			);
			expect(server.requests).toHaveLength(0);
			expect(answerText(events)).toContain("0748 017 752");
			expect(actionsOf(events)[0]?.kind).toBe("link");
		}
	});

	it("is not used where the site books itself (Psizone with its store), nor by Hemi-Sync", () => {
		expect(PSI_PROFILES.psizone.locales.ro?.handoff).toBeUndefined();
		expect(PSI_PROFILES.hemisync.locales.ro?.handoff).toBeUndefined();
		expect(PSI_PROFILES.blog.locales.ro?.handoff).toBeDefined();
	});
});

describe("a lookup that fails degrades silently", () => {
	it("answers on the blog when the search throws, with a note that keeps the failure from the visitor", async () => {
		const { guide, server, failures } = await startGuide({
			brand: "blog",
			searches: [{ kind: "throw" }],
			replies: [
				{
					kind: "text",
					chunks: ["Poți suna la 0748 017 752 sau începe o programare din butonul de mai jos."],
				},
			],
		});
		const events = await collect(guide.ask({ question: "Cum vă contactez?", locale: "ro" }));
		expect(shape(events)).not.toContain("refusal:unavailable");
		expect(answerText(events)).toContain("0748 017 752");
		expect(failures.map((f) => f.stage)).not.toContain("model");
		const second = JSON.stringify(server.requests[0]?.body);
		expect(second).toContain("Do not tell the visitor");
	});
});

describe("the centre's own numbers in the conversation", () => {
	it("stay as written in the guide's earlier turns, while a visitor's own number is still hidden", async () => {
		const { guide, server } = await startGuide({
			autoSearch: false,
			replies: [{ kind: "text", chunks: ["Poți suna la 0748 017 752."] }],
		});
		await collect(
			guide.ask({
				question: "și cât costă?",
				locale: "ro",
				history: [
					{ role: "user", text: "Mă puteți suna la 0723 456 789?" },
					{ role: "guide", text: "Sigur. Noi suntem la 0748 017 752 sau 0752 466 792." },
				],
			}),
		);
		const sent = JSON.stringify(server.requests[0]?.body);
		expect(sent).toContain("0748 017 752");
		expect(sent).toContain("0752 466 792");
		expect(sent).not.toContain("0723 456 789");
		expect(sent).toContain("[TELEFON]");
	});
});
