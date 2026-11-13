import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
beforeAll(async () => {
	c = await startConsole(
		MEMBER,
		{ today: "2026-11-16" },
		{ [MEMBER.sub]: [{ app: "psizone", roles: ["owner"] }] },
	);
	await c.signIn();
});
afterAll(() => c.close());

const html = async (path: string): Promise<string> => await (await c.get(path)).text();
const form = (values: Record<string, string>): URLSearchParams => new URLSearchParams(values);
const post = (path: string, values: Record<string, string>): Promise<Response> =>
	c.post(path, form(values), { "content-type": "application/x-www-form-urlencoded" });

describe("every tab has its primary action, and the empty states have it too", () => {
	it("Fișe: a client with no records offers 'Fișă nouă' as the primary action and in the empty state", async () => {
		const page = await html("/clients/c3/records");
		expect(page).toContain('data-action="record.new"');
		expect(page.match(/data-action="record.new"/g)?.length).toBeGreaterThanOrEqual(2);
		expect(page).toContain("Fișă nouă");
	});
	it("Fișiere: 'Încarcă fișier' opens the upload sheet with a drop zone, a picker, the camera and the limits", async () => {
		const page = await html("/clients/c3/files");
		expect(page).toContain('data-action="file.upload"');
		expect(page).toContain("data-drop");
		expect(page).toContain('multiple=""');
		expect(page).toContain('capture="environment"');
		expect(page).toContain("25 MB");
	});
	it("Note: 'Adaugă notă' is there, and so is the empty state", async () => {
		const page = await html("/clients/c3/notes");
		expect(page).toContain('data-action="note.add"');
		expect(page).toContain("Nu sunt note încă");
	});
	it("Programări: 'Programare nouă' is prefilled with the client", async () => {
		const page = await html("/clients/c3/appointments");
		expect(page).toContain('data-action="appointment.new"');
		expect(page).toContain("client=c3");
	});
	it("Prezentare: 'Editează datele' opens a sheet with the client's own values", async () => {
		const page = await html("/clients/c3");
		expect(page).toContain('data-action="client.edit"');
		expect(page).toContain('data-form="client-edit"');
	});
});

describe("notes", () => {
	it("a note is added, shows its author and category, and a pinned one rises to the client's page", async () => {
		const res = await post("/clients/c3/notes", {
			body: "Preferă mesaje",
			category: "payment",
			pinned: "on",
		});
		expect(res.status).toBe(200);
		const notes = await html("/clients/c3/notes");
		expect(notes).toContain("Preferă mesaje");
		expect(notes).toContain("Plată");
		expect(notes).toContain("Ana Test");
		expect(await html("/clients/c3")).toContain("data-pinned-strip");
	});
	it("an empty note is refused and nothing is written", async () => {
		const before = (await c.port.notes("psizone", "c3")).length;
		const res = await post("/clients/c3/notes", { body: "   " });
		expect(res.status).toBe(422);
		expect((await c.port.notes("psizone", "c3")).length).toBe(before);
	});
	it("an edited note says 'editat'; the confirmation is its own sheet and deleting removes it", async () => {
		const note = (await c.port.notes("psizone", "c3"))[0];
		expect(note).toBeDefined();
		const id = note?.id ?? "";
		await post(`/clients/c3/notes/${id}`, { body: "Altceva", category: "general" });
		expect(await html("/clients/c3/notes")).toContain("editat");
		expect(await html(`/clients/c3/notes?confirm=note.delete&id=${id}`)).toContain(
			`/clients/c3/notes/${id}/delete`,
		);
		await post(`/clients/c3/notes/${id}/delete`, {});
		expect((await c.port.notes("psizone", "c3")).some((n) => n.id === id)).toBe(false);
	});
	it("a clinical note is not shown to someone without the clinical group", async () => {
		const other = await startConsole(
			MEMBER,
			{ today: "2026-11-16" },
			{ [MEMBER.sub]: [{ app: "psizone", roles: ["reception"] }] },
		);
		await other.signIn();
		try {
			const page = await (await other.get("/clients/c1/notes")).text();
			expect(page).not.toContain("Reacționează bine la pauze");
		} finally {
			await other.close();
		}
	});
});

describe("blacklist", () => {
	it("needs a reason; with one it shows on the header, the list row and the history, and can be removed with a reason", async () => {
		const before = (await c.port.blacklistHistory("psizone", "c7")).length;
		expect(
			(await post("/clients/c7/blacklist", { reason: " ", category: "other", severity: "warn" }))
				.status,
		).toBe(422);
		expect((await c.port.blacklistHistory("psizone", "c7")).length).toBe(before);
		await post("/clients/c7/blacklist", {
			reason: "Nu răspunde",
			category: "no_show_repeated",
			severity: "block_online",
		});
		const page = await html("/clients/c7");
		expect(page).toContain("cl-flag--block");
		expect(page).toContain("Listă neagră");
		expect(page).toContain("Nu răspunde");
		expect(await html("/clients")).toContain('data-blacklist="block_online"');
		const entry = (await c.port.blacklistHistory("psizone", "c7"))[0];
		expect((await post(`/clients/c7/blacklist/${entry?.id}/end`, { reason: " " })).status).toBe(
			422,
		);
		await post(`/clients/c7/blacklist/${entry?.id}/end`, { reason: "Lămurit" });
		const after = await html("/clients/c7");
		expect(after).not.toContain("cl-flag--block");
		expect(after).toContain("data-blacklist-history");
		expect(after).toContain("Lămurit");
	});
	it("a warning is amber, a block is red", async () => {
		expect(await html("/clients/c5")).toContain("cl-flag--warn");
		expect(await html("/clients/c4")).toContain("cl-flag--block");
	});
});

describe("records", () => {
	it("pick a template, fill the form with its table rows, save a draft, then finalise", async () => {
		const picker = await html("/clients/c3/records/new");
		for (const key of [
			"aba-session-report",
			"race-me-up-report",
			"psychotherapy-report",
			"parent-questionnaire",
		])
			expect(picker).toContain(`data-template="${key}"`);
		const filler = await html("/clients/c3/records/new?form=aba-session-report");
		expect(filler).toContain('data-type="table"');
		expect(filler).toContain("data-add-row");
		await post("/clients/c3/records", {
			formKey: "aba-session-report",
			status: "draft",
			"f.recommendations": "Continuăm",
			"f.programs.0.name": "Imitație",
			"f.programs.0.success": "70%",
		});
		const made = (await c.port.records("psizone", "c3"))[0];
		expect(made?.status).toBe("draft");
		expect(made?.data.programs).toEqual([{ name: "Imitație", success: "70%" }]);
		await post("/clients/c3/records", {
			formKey: "aba-session-report",
			status: "final",
			id: made?.id ?? "",
			"f.recommendations": "Continuăm",
		});
		expect((await c.port.record("psizone", made?.id ?? ""))?.status).toBe("final");
		expect(await html("/clients/c3/records")).toContain("Finalizată");
	});
	it("an unknown form is refused and nothing is saved", async () => {
		const before = (await c.port.records("psizone", "c3")).length;
		expect((await post("/clients/c3/records", { formKey: "nope", status: "draft" })).status).toBe(
			422,
		);
		expect((await c.port.records("psizone", "c3")).length).toBe(before);
	});
});

describe("files", () => {
	const upload = (name: string, type: string, text: string): Promise<Response> => {
		const data = new FormData();
		data.append("files", new File([text], name, { type }));
		return c.post("/clients/c3/files", data);
	};
	it("uploads, lists, previews, downloads the same bytes, renames and deletes", async () => {
		await upload("raport.txt", "text/plain", "conținut");
		const file = (await c.port.files("psizone", "c3"))[0];
		expect(file?.name).toBe("raport.txt");
		expect(await html("/clients/c3/files")).toContain("raport.txt");
		const dl = await c.get(`/clients/c3/files/${file?.id}/download`);
		expect(await dl.text()).toBe("conținut");
		expect(dl.headers.get("content-disposition")).toContain("attachment");
		expect(dl.headers.get("x-content-type-options")).toBe("nosniff");
		const inline = await c.get(`/clients/c3/files/${file?.id}/download?inline=1`);
		expect(inline.headers.get("content-disposition")).toContain("inline");
		await post(`/clients/c3/files/${file?.id}/rename`, { name: "nou.txt" });
		expect((await c.port.files("psizone", "c3"))[0]?.name).toBe("nou.txt");
		await post(`/clients/c3/files/${file?.id}/delete`, {});
		expect(await c.port.files("psizone", "c3")).toEqual([]);
	});
	it("refuses a type that is not kept, writing nothing", async () => {
		await upload("a.exe", "application/x-msdownload", "x");
		expect(await c.port.files("psizone", "c3")).toEqual([]);
		expect(await html("/clients/c3/files?upload=invalid")).toContain("Nu s-a încărcat nimic");
	});
});

describe("the list's rich rows", () => {
	it("shows the next appointment and the flags per client, and summary cards", async () => {
		const page = await html("/clients");
		expect(page).toContain("data-summary");
		expect(page).toContain('data-client="c1"');
		expect(page).toMatch(/Următoarea:|Nicio programare viitoare/);
	});
	it("a new client from the list's sheet opens its page", async () => {
		const res = await post("/clients", { name: "Client Nou", phone: "0700 111 222" });
		expect(res.status).toBe(200);
		expect((await c.port.clients("psizone", "current", "Client Nou")).length).toBe(1);
	});
});
