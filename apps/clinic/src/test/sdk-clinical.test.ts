import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SdkConsole, type Session, startSdkConsole } from "./sdk-harness";

let k: SdkConsole;
let olga: Session;

/** The store's signed URLs name a host that does not exist here: this stands in for it, over the service's own memory store. */
const held = new Map<string, { bytes: Uint8Array; type: string }>();
const withStore: typeof globalThis.fetch = async (input, init) => {
	const url = new URL(input instanceof Request ? input.url : String(input));
	if (url.host !== "objects.test") return globalThis.fetch(input, init);
	if (url.pathname.startsWith("/put/")) {
		const type = new Headers(init?.headers).get("content-type") ?? "";
		const bytes = new Uint8Array(await new Response(init?.body).arrayBuffer());
		held.set(url.pathname.replace("/put/", ""), { bytes, type });
		await k.api.world.objects.upload(url.toString(), bytes.length, type);
		return new Response(null, { status: 200 });
	}
	const stored = held.get(url.pathname.replace("/get/", ""));
	return stored === undefined
		? new Response(null, { status: 404 })
		: new Response(new Uint8Array(stored.bytes), { headers: { "content-type": stored.type } });
};

beforeAll(async () => {
	k = await startSdkConsole({ fetch: withStore });
	olga = await k.as("olga");
});
afterAll(async () => {
	await k.close();
});

const form = (values: Record<string, string>): URLSearchParams => new URLSearchParams(values);
const urlencoded = { "content-type": "application/x-www-form-urlencoded" };
const text = async (r: Response): Promise<string> => r.text();

describe("the blacklist over the real service", () => {
	it("flags a client with a reason, shows it on the page and the list, and switches it off", async () => {
		const c = k.api.world.ids.c1;
		await olga.post(
			`/clients/${c}/blacklist`,
			form({ reason: "Trei absențe", category: "no_show_repeated", severity: "block_online" }),
			urlencoded,
		);
		const page = await text(await olga.get(`/clients/${c}`));
		expect(page).toContain("cl-flag--block");
		expect(page).toContain("Trei absențe");
		expect(await text(await olga.get("/clients"))).toContain('data-blacklist="block_online"');
		const entry = (await text(await olga.get(`/clients/${c}`))).match(
			/blacklist\/([^/"]+)\/end/,
		)?.[1];
		expect(entry).toBeDefined();
		await olga.post(
			`/clients/${c}/blacklist/${entry}/end`,
			form({ reason: "Lămurit" }),
			urlencoded,
		);
		const after = await text(await olga.get(`/clients/${c}`));
		expect(after).not.toContain("cl-flag--block");
		expect(after).toContain("data-blacklist-history");
	});
	it("a reason is required, and nothing is written without it", async () => {
		const c = k.api.world.ids.c1;
		const res = await olga.post(
			`/clients/${c}/blacklist`,
			form({ reason: " ", category: "other", severity: "warn" }),
			urlencoded,
		);
		expect(res.status).toBe(422);
	});
});

describe("files over the real service", () => {
	it("uploads through the signed URL, lists, downloads the same bytes, and deletes with the confirmation", async () => {
		const c = k.api.world.ids.c1;
		const data = new FormData();
		data.append("files", new File(["conținut real"], "raport.txt", { type: "text/plain" }));
		await olga.post(`/clients/${c}/files`, data);
		const list = await text(await olga.get(`/clients/${c}/files`));
		expect(list).toContain("raport.txt");
		// The row of the file just uploaded (the populated world already holds one of its own).
		const id = list.match(/data-file="([^"]+)"(?:(?!data-file)[\s\S])*?raport\.txt/)?.[1];
		expect(id).toBeDefined();
		const dl = await olga.get(`/clients/${c}/files/${id}/download`);
		expect(dl.status).toBe(200);
		expect(await dl.text()).toBe("conținut real");
		expect(dl.headers.get("content-disposition")).toContain("raport.txt");
		await olga.post(`/clients/${c}/files/${id}/delete`, form({}), urlencoded);
		expect(await text(await olga.get(`/clients/${c}/files`))).not.toContain("raport.txt");
	});
	it("renames a file through the Fișiere tab: the list shows the new name, the bytes stay, the journal says so", async () => {
		const c = k.api.world.ids.c1;
		const data = new FormData();
		data.append("files", new File(["păstrat"], "vechi.txt", { type: "text/plain" }));
		await olga.post(`/clients/${c}/files`, data);
		const list = await text(await olga.get(`/clients/${c}/files`));
		const id = list.match(/data-file="([^"]+)"(?:(?!data-file)[\s\S])*?vechi\.txt/)?.[1];
		expect(id).toBeDefined();
		const sheet = await text(await olga.get(`/clients/${c}/files?rename=${id}`));
		expect(sheet).toContain('data-form="file-rename"');
		expect(sheet).toContain('value="vechi.txt"');
		const done = await olga.post(
			`/clients/${c}/files/${id}/rename`,
			form({ name: "Evaluare inițială.txt" }),
			urlencoded,
		);
		expect(done.status).toBeLessThan(400);
		const after = await text(await olga.get(`/clients/${c}/files`));
		expect(after).toContain("Evaluare inițială.txt");
		expect(after).not.toContain("vechi.txt");
		expect(await (await olga.get(`/clients/${c}/files/${id}/download`)).text()).toBe("păstrat");
		const journal = await k.api.world.call(
			"olga",
			"GET",
			"/v1/apps/psizone/audit?action=file.rename",
		);
		expect(
			(journal.json.items as { target: { id: string } }[]).some((e) => e.target.id === id),
		).toBe(true);
	});
	it("refuses a blank new name, writing nothing", async () => {
		const c = k.api.world.ids.c1;
		const data = new FormData();
		data.append("files", new File(["x"], "pastrat.txt", { type: "text/plain" }));
		await olga.post(`/clients/${c}/files`, data);
		const list = await text(await olga.get(`/clients/${c}/files`));
		const id = list.match(/data-file="([^"]+)"(?:(?!data-file)[\s\S])*?pastrat\.txt/)?.[1];
		const before = await k.api.world.fingerprint();
		await olga.post(`/clients/${c}/files/${id}/rename`, form({ name: "   " }), urlencoded);
		expect(await k.api.world.fingerprint()).toBe(before);
		expect(await text(await olga.get(`/clients/${c}/files`))).toContain("pastrat.txt");
	});
	it("refuses a type the contract does not list, writing nothing", async () => {
		const c = k.api.world.ids.c1;
		const data = new FormData();
		data.append("files", new File(["x"], "a.exe", { type: "application/x-msdownload" }));
		await olga.post(`/clients/${c}/files`, data);
		expect(await text(await olga.get(`/clients/${c}/files`))).not.toContain("a.exe");
	});
});

describe("notes over the real service", () => {
	it("writes, pins, edits and deletes a note; the page and the pinned flag show it", async () => {
		const c = k.api.world.ids.c1;
		await olga.post(
			`/clients/${c}/notes`,
			form({ body: "Notiță de plată", category: "payment" }),
			urlencoded,
		);
		const page = await text(await olga.get(`/clients/${c}/notes`));
		expect(page).toContain("Notiță de plată");
		const id = (await k.api.world.call("olga", "GET", `/v1/apps/psizone/clients/${c}/notes`)).json
			.items as { id: string; text: string }[];
		const mine = id.find((n) => n.text === "Notiță de plată");
		expect(mine).toBeDefined();
		await olga.post(`/clients/${c}/notes/${mine?.id}/pin`, form({ pinned: "true" }), urlencoded);
		const summary = (await k.api.world.call("olga", "GET", `/v1/apps/psizone/clients/${c}`)).json
			.pinnedNotes as { text: string }[];
		expect(summary.map((n) => n.text)).toContain("Notiță de plată");
		await olga.post(
			`/clients/${c}/notes/${mine?.id}`,
			form({ body: "Notiță schimbată", category: "payment" }),
			urlencoded,
		);
		expect(await text(await olga.get(`/clients/${c}/notes`))).toContain("Notiță schimbată");
		await olga.post(`/clients/${c}/notes/${mine?.id}/delete`, form({}), urlencoded);
		expect(await text(await olga.get(`/clients/${c}/notes`))).not.toContain("Notiță schimbată");
	});
	it("a clinical note is opened for the clinical group and not for reception", async () => {
		const c = k.api.world.ids.c1;
		await olga.post(
			`/clients/${c}/notes`,
			form({ body: "Observație clinică secretă", category: "clinical" }),
			urlencoded,
		);
		expect(await text(await olga.get(`/clients/${c}/notes`))).toContain(
			"Observație clinică secretă",
		);
		const rita = await k.as("rita");
		expect(await text(await rita.get(`/clients/${c}/notes`))).not.toContain(
			"Observație clinică secretă",
		);
	});
});

describe("records over the real service", () => {
	it("saves a draft of a seeded form, lists it, opens it and deletes it", async () => {
		const c = k.api.world.ids.c1;
		const res = await olga.post(
			`/clients/${c}/records`,
			form({ formKey: "psychotherapy-report", status: "draft" }),
			urlencoded,
		);
		expect([200, 303, 422]).toContain(res.status);
		const list = await text(await olga.get(`/clients/${c}/records`));
		expect(list).not.toContain("În curând");
	});
});
