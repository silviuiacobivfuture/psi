import { memoryStores, rememberingGuide } from "@psi/account";
import type { Guide } from "@psi/guide";
import { accountMemory, answerGuidePost, type MemoryAccount } from "@psi/ui";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { guideLabels } from "./guide";

const SITE = "eqsync";
const SUBJECT = "person-1";

const answering: Guide = {
	brand: "eqsync",
	model: "test",
	async *ask(input) {
		yield { type: "text", delta: `Răspuns la: ${input.question}` };
		yield { type: "done" };
	},
};

/**
 * The account's real stores (in memory), and a person already signed in: sign-in itself is the
 * account package's, and the local issuer only lets the showcase ports in.
 */
function signedIn(consented: boolean) {
	const stores = memoryStores();
	const account: MemoryAccount = {
		async person() {
			return { subject: SUBJECT };
		},
		async stores() {
			return stores;
		},
	};
	return {
		stores,
		account,
		async consent() {
			if (consented) await stores.consents.grant(SUBJECT, "guide_memory", "v1", Date.now());
		},
	};
}

async function post(account: MemoryAccount, body: unknown, guide: Guide = answering) {
	const app = new Hono();
	app.post("/ghid", (c) =>
		answerGuidePost(c, {
			locale: "ro",
			labels: guideLabels("ro"),
			guide: async () => guide,
			memory: () => accountMemory(account, c, SITE),
		}),
	);
	const res = await app.request("/ghid?target=compass-answer", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"sec-fetch-site": "same-origin",
		},
		body: JSON.stringify(body),
	});
	const lines = (await res.text()).split("\n");
	const last = lines.filter((l) => l.startsWith("data: signals ")).at(-1);
	return {
		elements: lines.filter((l) => l.startsWith("data: elements ")).join("\n"),
		signals: last === undefined ? {} : JSON.parse(last.slice("data: signals ".length)),
	};
}

describe("the remembered conversation in the compass (consent `guide_memory`)", () => {
	it("follows the person to a new device, and New conversation deletes it", async () => {
		const person = signedIn(true);
		await person.consent();
		const remembering = rememberingGuide(answering, {
			conversations: person.stores.conversations,
			subject: SUBJECT,
			site: SITE,
		});
		// Asked on one device: the account keeps the answered turn.
		await post(person.account, { compassOp: "ask", compassQuery: "Ce e EQ-SYNC?" }, remembering);
		// A new device, nothing kept in its browser: the transcript comes from the account.
		const restored = await post(person.account, {
			compassOp: "restore",
			compassTurns: [],
		});
		expect(restored.signals).toEqual({
			compassTurns: [
				{ role: "user", text: "Ce e EQ-SYNC?" },
				{ role: "guide", text: "Răspuns la: Ce e EQ-SYNC?" },
			],
			compassPending: "",
			compassRemembered: true,
		});
		expect(restored.elements).toContain("Răspuns la: Ce e EQ-SYNC?");
		// New conversation: gone from the account too.
		await post(person.account, { compassOp: "reset" });
		expect(await person.stores.conversations.forSite(SUBJECT, SITE)).toBeNull();
		const after = await post(person.account, {
			compassOp: "restore",
			compassTurns: [],
		});
		expect(after.signals.compassTurns).toEqual([]);
	});

	it("without consent nothing is read from the account, and the page's own turns are the transcript", async () => {
		const person = signedIn(false);
		await person.stores.conversations.append(SUBJECT, SITE, {
			question: "kept anyway?",
			answer: "no",
			at: Date.now(),
		});
		const local = [
			{ role: "user", text: "a" },
			{ role: "guide", text: "A" },
		];
		const restored = await post(person.account, {
			compassOp: "restore",
			compassTurns: local,
		});
		expect(restored.signals).toEqual({
			compassTurns: local,
			compassPending: "",
			compassRemembered: false,
		});
		await post(person.account, { compassOp: "reset" });
		expect(await person.stores.conversations.forSite(SUBJECT, SITE)).not.toBeNull();
	});
});
