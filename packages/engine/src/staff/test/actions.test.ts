import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matchActions } from "../actions";
import { confirmProposal } from "../execute";
import { createMemoryProposalStore } from "../proposals";
import { FAKE_ACTIONS, FakeStaffPort, OWNER_PERMISSIONS } from "../testing";
import { call, proposalIdOf, sessionFor } from "./helpers";
import { collect, type Harness, romanianOwner, startEngine, textOf } from "./turn-harness";

const CLIENT_PAGE = { screen: "client", clientId: "c1" } as const;

function exampleParams(id: string): Record<string, unknown> {
	const action = FAKE_ACTIONS.find((a) => a.id === id);
	if (action === undefined) throw new Error(id);
	return Object.fromEntries(
		action.params
			.filter((p) => p.required)
			.map((p) => [p.name, p.kind === "date" ? "2026-11-02" : p.kind === "id" ? "c1" : "x"]),
	);
}

describe("every registry action, for a person who may and one who may not", () => {
	it.each(
		FAKE_ACTIONS.map((a) => [a.id, a] as const),
	)("%s: found and proposed (or run) with the capability, invisible and refused without it", async (id, action) => {
		// With the capability.
		const owner = new FakeStaffPort();
		owner.permissions = OWNER_PERMISSIONS;
		const proposals = createMemoryProposalStore();
		const session = await sessionFor(owner, { page: CLIENT_PAGE, proposals });
		const listed = await call(session, "listActions", {});
		expect(JSON.stringify(listed)).toContain(`"${id}"`);
		const ran = await call(session, "runAction", { actionId: id, params: exampleParams(id) });
		if (action.kind === "write") {
			expect(ran.status).toBe("needs_confirmation");
			expect(owner.data.ran).toEqual([]);
			const outcome = await confirmProposal(session, proposalIdOf(ran));
			expect(outcome.status).toBe("done");
			expect(owner.data.ran.map((r) => r.id)).toEqual([id]);
		} else {
			expect(ran.status).toBe("ok");
			expect(owner.data.ran.map((r) => r.id)).toEqual([id]);
		}

		// Without it: nothing listed, nothing proposed, nothing run.
		const nobody = new FakeStaffPort();
		nobody.permissions = OWNER_PERMISSIONS.filter((k) => !k.startsWith(action.needs));
		const bare = await sessionFor(nobody, { page: CLIENT_PAGE });
		expect(JSON.stringify(await call(bare, "listActions", {}))).not.toContain(`"${id}"`);
		const refused = await call(bare, "runAction", { actionId: id, params: exampleParams(id) });
		expect(refused).toMatchObject({ status: "refused", reason: "not_allowed" });
		expect(bare.cards.filter((c) => c.kind === "proposal")).toEqual([]);
		expect(nobody.data.ran).toEqual([]);
	});

	it("an action tied to a screen is listed only there", async () => {
		const port = new FakeStaffPort();
		port.permissions = OWNER_PERMISSIONS;
		const calendar = await sessionFor(port, { page: { screen: "calendar" } });
		expect(JSON.stringify(await call(calendar, "listActions", {}))).not.toContain("files.upload");
		const client = await sessionFor(port, { page: CLIENT_PAGE });
		expect(JSON.stringify(await call(client, "listActions", {}))).toContain("files.upload");
	});

	it("a missing parameter is named, not guessed, and nothing is prepared", async () => {
		const port = new FakeStaffPort();
		port.permissions = OWNER_PERMISSIONS;
		const session = await sessionFor(port, { page: CLIENT_PAGE });
		const out = await call(session, "runAction", {
			actionId: "clients.blacklist",
			params: { clientId: "c1" },
		});
		expect(out).toMatchObject({ status: "missing", missing: ["reason"] });
		expect(session.cards).toEqual([]);
	});

	it("an action the person lost between the card and the button is refused at the button, and nothing runs", async () => {
		const port = new FakeStaffPort();
		port.permissions = OWNER_PERMISSIONS;
		const proposals = createMemoryProposalStore();
		const session = await sessionFor(port, { page: CLIENT_PAGE, proposals });
		const id = proposalIdOf(
			await call(session, "runAction", {
				actionId: "clients.blacklist",
				params: { clientId: "c1", reason: "no-shows" },
			}),
		);
		port.permissions = OWNER_PERMISSIONS.filter((k) => !k.startsWith("clients_edit"));
		const outcome = await confirmProposal(session, id);
		expect(outcome.status).toBe("forbidden");
		expect(port.data.ran).toEqual([]);
	});

	it("matching finds an action by the words of a request, accents and endings aside", () => {
		const ro = FAKE_ACTIONS.map(({ ro, ...rest }) => ({ ...rest, ...ro }));
		expect(matchActions(ro, "pune-l pe lista neagră pe Ion")[0]?.id).toBe("clients.blacklist");
		expect(matchActions(ro, "adaugă o notiță la fișă")[0]?.id).toBe("clients.addNote");
		expect(matchActions(ro, "zzz qqq")).toEqual([]);
	});
});

describe('"nu am un instrument" is blocked when an action matches', () => {
	let h: Harness | undefined;
	beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
	afterEach(async () => {
		vi.unstubAllEnvs();
		await h?.close();
		h = undefined;
	});

	it("the reply is replaced by what can be done, naming the action", async () => {
		h = await startEngine([
			{
				kind: "text",
				chunks: ["Îmi pare rău, nu am un instrument pentru a pune un client pe lista neagră."],
			},
		]);
		const events = await collect(
			h.engine.chat(romanianOwner(), {
				message: "pune-l pe Ion pe lista neagră",
				page: CLIENT_PAGE,
			}),
		);
		const text = textOf(events);
		expect(text).not.toContain("nu am un instrument");
		expect(text).toContain("Pune un client pe lista neagră");
	});

	it("when no action matches, or the person lacks the capability, the denial stands", async () => {
		h = await startEngine([{ kind: "text", chunks: ["Nu am un instrument pentru asta."] }]);
		const port = romanianOwner();
		port.permissions = [];
		const events = await collect(
			h.engine.chat(port, { message: "pune-l pe Ion pe lista neagră", page: CLIENT_PAGE }),
		);
		expect(textOf(events)).toBe("Nu am un instrument pentru asta.");
	});

	it("the model is told to discover before it denies, and is offered the discovery tools", async () => {
		h = await startEngine([{ kind: "text", chunks: ["Bine."] }]);
		await collect(h.engine.chat(romanianOwner(), { message: "salut" }));
		const body = JSON.stringify(h.fake.requests[0]?.body);
		expect(body).toContain("staffListActions");
		expect(body).toContain("staffRunAction");
		expect(body).toContain("Nu spune niciodată");
	});

	it("the chip of a discovery says how many actions were found", async () => {
		h = await startEngine([
			{ kind: "tool", query: "", tool: "staffListActions", input: { about: "neagră" } },
			{ kind: "text", chunks: ["Se poate."] },
		]);
		const events = await collect(
			h.engine.chat(romanianOwner(), { message: "listă neagră", page: CLIENT_PAGE }),
		);
		expect(events.find((e) => e.type === "tool" && e.phase === "done")).toMatchObject({
			label: "Am găsit o acțiune",
		});
	});
});
