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
	it("refuses a type the contract does not list, writing nothing", async () => {
		const c = k.api.world.ids.c1;
		const data = new FormData();
		data.append("files", new File(["x"], "a.exe", { type: "application/x-msdownload" }));
		await olga.post(`/clients/${c}/files`, data);
		expect(await text(await olga.get(`/clients/${c}/files`))).not.toContain("a.exe");
	});
});

describe("what the service keeps no route for yet says so", () => {
	it("notes and records say 'în curând' instead of breaking the page", async () => {
		const c = k.api.world.ids.c1;
		expect(await text(await olga.get(`/clients/${c}/notes`))).toContain("În curând");
		expect(await text(await olga.get(`/clients/${c}/records`))).toContain("În curând");
	});
});
