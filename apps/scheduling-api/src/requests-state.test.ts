import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, NOW } from "./testing/world";

/** requests.list with `state`: the open requests only, or the decided ones only; without it, all of them. */
const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const key = (method: string, path: string, body?: unknown) =>
	w.callKey("psizone-web", method, `${A}${path}`, body);

/** Three held-and-submitted requests; the first is then declined by the team. */
async function three(): Promise<{ references: string[]; declined: string }> {
	const references: string[] = [];
	for (let i = 0; i < 3; i++) {
		// The first free slot, asked again after each hold: a held one is no longer offered.
		const free = await key(
			"GET",
			`/book/slots?service=evaluation&from=${NOW}&to=${NOW + 10 * 24 * HOUR}&limit=1`,
		);
		const s = (free.json.slots as { practitioner: string; start: number }[])[0];
		if (s === undefined) throw new Error("no free slot");
		const h = (
			await key("POST", "/book/holds", {
				service: "evaluation",
				practitioner: s.practitioner,
				start: s.start,
				mode: "onsite",
				locale: "ro",
				channel: "form",
			})
		).json;
		await key("POST", `/book/holds/${h.reference}/submit`, {
			holdToken: h.holdToken,
			contact: { name: "V", phone: "0733 000 111" },
		});
		if (typeof h.reference !== "string") throw new Error(JSON.stringify(h));
		references.push(h.reference);
	}
	const declined = references[0] ?? "";
	await w.call("rita", "POST", `${A}/requests/${declined}/decision`, { decision: "decline" });
	return { references, declined };
}

const list = async (state?: string): Promise<{ reference: string; status: string }[]> => {
	const res = await w.call(
		"rita",
		"GET",
		`${A}/requests?from=0&to=${NOW + 30 * 24 * HOUR}${state === undefined ? "" : `&state=${state}`}`,
	);
	expect(res.status, JSON.stringify(res.json)).toBe(200);
	return res.json.items as { reference: string; status: string }[];
};

describe("requests.list by state", () => {
	it("open: only the requests still waiting; handled: only the decided; neither: all", async () => {
		const { references, declined } = await three();
		const all = await list();
		const open = await list("open");
		const handled = await list("handled");
		for (const r of references) expect(all.map((x) => x.reference)).toContain(r);
		expect(open.every((r) => r.status === "requested")).toBe(true);
		expect(open.map((r) => r.reference)).not.toContain(declined);
		expect(handled.every((r) => r.status !== "requested")).toBe(true);
		expect(handled.map((r) => r.reference)).toContain(declined);
		expect(open.length + handled.length).toBe(all.length);
	});

	it("an unknown state is refused", async () => {
		const res = await w.call("rita", "GET", `${A}/requests?from=0&to=${NOW}&state=maybe`);
		expect(res.status).toBe(400);
	});
});
