import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
beforeEach(async () => {
	c = await startConsole(MEMBER);
	await c.signIn();
});
afterEach(() => c.close());

const snapshot = async () => ({
	clients: (await c.port.clients("psizone", "current", "")).length,
	archived: (await c.port.clients("psizone", "archived", "")).length,
	appts: (await c.port.clientAppointments("psizone", "c1")).length,
	packages: (await c.port.packages("psizone", "c1")).length,
	audit: (await c.port.audit("psizone")).length,
});

describe("the client page", () => {
	it("has separate Archive and Delete buttons, each guarded by exactly one confirmation", async () => {
		const html = await (await c.get("/clients/c1")).text();
		expect(html).toContain("Arhivează");
		expect(html).toContain("Șterge");
		expect(html.match(/action="\/clients\/c1\/archive"/g)).toHaveLength(1);
		expect(html.match(/action="\/clients\/c1\/delete"/g)).toHaveLength(1);
		expect(html).toContain("Da, arhivează");
		expect(html).toContain("Da, șterge definitiv");
	});

	it("shows only Delete for a client already in the archive", async () => {
		const html = await (await c.get("/clients/c23")).text();
		expect(html).not.toContain('action="/clients/c23/archive"');
		expect(html).toContain('action="/clients/c23/delete"');
	});

	it("changes nothing when the page is only looked at", async () => {
		const before = await snapshot();
		await c.get("/clients/c1");
		await c.get("/clients/c1/packages");
		expect(await snapshot()).toEqual({ ...before });
	});
});

describe("Archive", () => {
	it("hides the client from the active list and keeps appointments, packages and the record", async () => {
		const before = await snapshot();
		const res = await c.post("/clients/c1/archive");
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("Clientul a fost arhivat.");
		const after = await snapshot();
		expect(after.clients).toBe(before.clients - 1);
		expect(after.archived).toBe(before.archived + 1);
		expect(after.appts).toBe(before.appts);
		expect(after.packages).toBe(before.packages);
		expect((await c.port.client("psizone", "c1"))?.status).toBe("archived");
		expect(after.audit).toBe(before.audit + 1);
		expect((await c.port.audit("psizone"))[0]?.action).toBe("client.archive");
	});

	it("says so on the page, and the client is found in the Archive filter", async () => {
		await c.post("/clients/c1/archive");
		expect(await (await c.get("/clients/c1?done=archived")).text()).toContain(
			"Clientul a fost arhivat.",
		);
		expect(await (await c.get("/clients?filter=archived")).text()).toContain("Ștefan Exemplu 01");
		expect(await (await c.get("/clients?filter=current")).text()).not.toContain(
			"Ștefan Exemplu 01",
		);
	});

	it("does not touch the other clients, nor the other app", async () => {
		await c.post("/clients/c1/archive");
		expect((await c.port.client("psizone", "c2"))?.status).toBe("current");
		expect((await c.port.client("hemisync", "c1"))?.status).toBe("current");
	});

	it("is a 404 for a client that does not exist, and writes nothing", async () => {
		const before = await snapshot();
		expect((await c.post("/clients/zz/archive")).status).toBe(404);
		expect(await snapshot()).toEqual(before);
	});
});

describe("Delete", () => {
	it("erases the client, their appointments and their packages — and only theirs", async () => {
		const before = await snapshot();
		const otherAppts = (await c.port.clientAppointments("psizone", "c2")).length;
		const res = await c.post("/clients/c1/delete");
		expect(res.status).toBe(200);
		expect(await res.text()).not.toContain("Ștefan Exemplu 01");
		expect(await c.port.client("psizone", "c1")).toBeNull();
		const after = await snapshot();
		expect(after.clients).toBe(before.clients - 1);
		expect(after.archived).toBe(before.archived);
		expect(after.appts).toBe(0);
		expect(after.packages).toBe(0);
		expect((await c.port.clientAppointments("psizone", "c2")).length).toBe(otherAppts);
		expect((await c.port.audit("psizone"))[0]?.action).toBe("client.delete");
	});

	it("works on an archived client too, with no need to archive first", async () => {
		await c.post("/clients/c23/delete");
		expect(await c.port.client("psizone", "c23")).toBeNull();
	});

	it("is a 404 for a client that does not exist, and writes nothing", async () => {
		const before = await snapshot();
		expect((await c.post("/clients/zz/delete")).status).toBe(404);
		expect(await snapshot()).toEqual(before);
	});

	it("leaves the other app's client with the same id alone", async () => {
		await c.post("/clients/c1/delete");
		expect(await c.port.client("hemisync", "c1")).not.toBeNull();
	});
});
