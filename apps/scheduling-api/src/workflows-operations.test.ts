import { beforeEach, describe, expect, it } from "vitest";
import { whatsappNumber } from "./handlers/reminders";
import { createWorld, type Populated } from "./testing/populate";
import { NOW } from "./testing/world";

const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const owner = (method: string, path: string, body?: unknown) =>
	w.call("olga", method, `${A}${path}`, body);
const _err = (r: {
	json: Record<string, unknown>;
}): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };

describe("reminders", () => {
	it("lists tomorrow's visits by default, with the state, and marks them once", async () => {
		const day = (await owner("GET", "/reminders")).json as {
			date: string;
			items: { appointmentId: string; state: string; clientName?: string }[];
		};
		expect(day.date).toBe("2026-11-14");
		expect(day.items.map((i) => i.clientName)).toEqual(["Client One", "Client Two"]);
		await owner("POST", `/reminders/${w.ids.a1}/state`, { state: "confirmed" });
		await owner("POST", `/reminders/${w.ids.a1}/state`, { state: "confirmed" });
		expect(
			((await owner("GET", "/reminders")).json.items as { state: string }[]).map((i) => i.state),
		).toEqual(["confirmed", "pending"]);
		expect((await w.store.c.reminders.list("psizone")).length).toBe(1);
	});

	it("sends the e-mail through the port in the asked language, then marks it sent", async () => {
		await owner("POST", `/reminders/${w.ids.a2}/email`, { locale: "en" });
		expect(w.mail.outbox).toHaveLength(1);
		expect(w.mail.outbox[0]).toMatchObject({ to: "two@example.test" });
		expect(w.mail.outbox[0]?.text).toContain("Hello Client Two!");
		expect(((await owner("GET", "/reminders")).json.items as { state: string }[])[1]?.state).toBe(
			"sent",
		);
	});

	it("a failed send is not recorded as sent", async () => {
		w.deps.mailer = { send: () => Promise.reject(new Error("smtp down")) };
		const r = await owner("POST", `/reminders/${w.ids.a2}/email`, { locale: "ro" });
		expect(r.status).toBe(500);
		expect(await w.store.c.reminders.get("psizone", w.ids.a2)).toBeUndefined();
	});

	it("refuses to e-mail without a configured mailer, without an address, or for a cancelled visit", async () => {
		const mailer = w.deps.mailer;
		w.deps.mailer = undefined;
		expect((await owner("POST", `/reminders/${w.ids.a2}/email`, { locale: "ro" })).status).toBe(
			503,
		);
		w.deps.mailer = mailer;
		await owner("PATCH", `/clients/${w.ids.c2}`, { contact: { email: undefined } });
		const c = await w.store.c.clients.get("psizone", w.ids.c2);
		if (c)
			await w.store.c.clients.replace({
				...c,
				contact: { phone: "0712 345 678" },
				guardian: { name: "G" },
			});
		expect((await owner("POST", `/reminders/${w.ids.a2}/email`, { locale: "ro" })).status).toBe(
			409,
		);
		await owner("POST", `/appointments/${w.ids.a1}/cancel`, { reason: "xx" });
		expect((await owner("POST", `/reminders/${w.ids.a1}/email`, { locale: "ro" })).status).toBe(
			409,
		);
	});

	it("builds the one-tap WhatsApp link with the prepared text and a normalised number", async () => {
		const r = (await owner("GET", `/reminders/${w.ids.a1}/whatsapp?locale=ro`)).json as {
			url: string;
			text: string;
		};
		expect(r.url.startsWith("https://wa.me/40712345678?text=")).toBe(true);
		expect(decodeURIComponent(r.url.split("text=")[1] ?? "")).toBe(r.text);
		expect(r.text).toContain("Client One");
	});

	it("normalises phone numbers for wa.me", () => {
		expect(whatsappNumber("0712 345 678")).toBe("40712345678");
		expect(whatsappNumber("+40 712 345 678")).toBe("40712345678");
		expect(whatsappNumber("0040712345678")).toBe("40712345678");
		expect(whatsappNumber("12")).toBeUndefined();
		expect(whatsappNumber("")).toBeUndefined();
	});

	it("contact is needed to send: a role without contact access cannot e-mail or build the link", async () => {
		await owner("PUT", "/members/rita/overrides", {
			grant: [],
			deny: ["clients_view_all_contact"],
		});
		expect(
			(await w.call("rita", "POST", `${A}/reminders/${w.ids.a1}/email`, { locale: "ro" })).status,
		).toBe(403);
		expect(
			(await w.call("rita", "GET", `${A}/reminders/${w.ids.a1}/whatsapp?locale=ro`)).status,
		).toBe(403);
	});
});

describe("catalogue, records, files, builder, audit", () => {
	it("a person with history is deactivated, not deleted; one without is removed with their calendar links", async () => {
		await owner("DELETE", `/people/${w.ids.dora}`);
		expect((await w.store.c.people.get("psizone", w.ids.dora))?.active).toBe(false);
		const fresh = (
			await owner("POST", "/people", { displayName: "Temp", kind: "staff", subject: "temp" })
		).json.id as string;
		await owner("DELETE", `/people/${fresh}`);
		expect(await w.store.c.people.get("psizone", fresh)).toBeUndefined();
		expect(w.authz.tuples().some((t) => t.object === `sched_calendar:${fresh}`)).toBe(false);
	});

	it("binding a person to an account moves their scope with it", async () => {
		expect((await w.call("dora", "GET", `${A}/clients`)).json.items).toHaveLength(1);
		await owner("PATCH", `/people/${w.ids.dora}`, { subject: "dora2" });
		expect((await w.call("dora", "GET", `${A}/clients`)).json.items).toHaveLength(0);
		await owner("PUT", "/members/dora2", {
			displayName: "Dora",
			roles: [w.ids.roles.therapist],
			coordinates: [],
		});
		expect((await w.call("dora2", "GET", `${A}/clients`)).json.items).toHaveLength(1);
	});

	it("a service slug is unique and a service cannot name a person who is not there", async () => {
		expect(
			(
				await owner("POST", "/services", {
					slug: "evaluation",
					name: { ro: "a", en: "a" },
					durationMinutes: 30,
					modes: ["onsite"],
				})
			).status,
		).toBe(409);
		expect(
			(
				await owner("POST", "/services", {
					slug: "other",
					name: { ro: "a", en: "a" },
					durationMinutes: 30,
					modes: ["onsite"],
					practitionerIds: ["ghost0000001"],
				})
			).status,
		).toBe(400);
	});

	it("a record needs a form that exists, is written with that form's version, and survives the form's replacement", async () => {
		expect(
			(await owner("POST", `/clients/${w.ids.c1}/records`, { formId: "nope", data: {} })).status,
		).toBe(400);
		await owner("PUT", `/builder/forms/${w.ids.form}`, {
			name: { ro: "R", en: "R" },
			body: { kind: "session_report", fields: ["summary", "plan"] },
		});
		const rec = (
			await owner("POST", `/clients/${w.ids.c1}/records`, {
				formId: w.ids.form,
				data: { plan: "p" },
			})
		).json;
		expect(rec.formVersion).toBe(2);
		expect((await owner("GET", `/records/${w.ids.record}`)).json.formVersion).toBe(1);
		expect((await owner("DELETE", `/builder/forms/${w.ids.form}`)).status).toBe(409);
	});

	it("a record over the size limit is refused", async () => {
		expect(
			(
				await owner("POST", `/clients/${w.ids.c1}/records`, {
					formId: w.ids.form,
					data: { x: "a".repeat(100_001) },
				})
			).status,
		).toBe(400);
	});

	it("signs an upload, then a download after completion; a pending file cannot be downloaded; delete removes the object", async () => {
		const init = (
			await owner("POST", `/clients/${w.ids.c1}/files`, {
				name: "scan.pdf",
				contentType: "application/pdf",
				size: 10,
			})
		).json as { file: { id: string }; upload: { url: string; method: string } };
		expect(init.upload).toMatchObject({ method: "PUT" });
		expect(init.upload.url).toContain(`psizone/${w.ids.c1}/`);
		expect((await owner("GET", `/files/${init.file.id}/download`)).status).toBe(409);
		await owner("POST", `/files/${init.file.id}/complete`);
		const dl = (await owner("GET", `/files/${init.file.id}/download`)).json;
		expect(dl).toMatchObject({ method: "GET" });
		expect(
			((await owner("GET", "/audit?action=file.download")).json.items as unknown[]).length,
		).toBe(1);
		const key = (await w.store.c.files.get("psizone", init.file.id))?.objectKey;
		await owner("DELETE", `/files/${init.file.id}`);
		expect(key).toContain(`psizone/${w.ids.c1}/`);
		expect(w.objects.removed).toContain(key);
	});

	it("without object storage, files are 503", async () => {
		w.deps.objects = undefined;
		expect(
			(
				await owner("POST", `/clients/${w.ids.c1}/files`, {
					name: "a",
					contentType: "x/y",
					size: 1,
				})
			).status,
		).toBe(503);
	});

	it("a therapist sees files of their own clients only", async () => {
		expect((await w.call("dora", "GET", `${A}/clients/${w.ids.c1}/files`)).status).toBe(200);
		expect((await w.call("dora", "GET", `${A}/clients/${w.ids.c2}/files`)).status).toBe(404);
	});

	it("builder definitions are validated per kind; each replace is a new version", async () => {
		expect(
			(
				await owner("PUT", "/builder/fields/bad", {
					name: { ro: "a", en: "a" },
					body: { entity: "client", key: "k", type: "text", group: "secret" },
				})
			).status,
		).toBe(400);
		const ok = {
			name: { ro: "a", en: "a" },
			body: { entity: "client", key: "nick", type: "text", group: "contact" },
		};
		expect((await owner("PUT", "/builder/fields/nick", ok)).json.version).toBe(1);
		expect((await owner("PUT", "/builder/fields/nick", ok)).json.version).toBe(2);
		expect((await owner("PUT", "/builder/views/nick", ok)).status).toBe(409);
		expect(
			(
				await owner("PUT", "/builder/fields/big", {
					name: ok.name,
					body: { ...ok.body, options: ["x".repeat(70_000)] },
				})
			).status,
		).toBe(400);
	});

	it("filters the audit log by action and window, newest first", async () => {
		const all = (await owner("GET", "/audit")).json.items as { at: number }[];
		expect(all.map((e) => e.at)).toEqual([...all.map((e) => e.at)].sort((a, b) => b - a));
		expect(((await owner("GET", "/audit?action=app.create")).json.items as unknown[]).length).toBe(
			0,
		);
		expect(((await owner("GET", `/audit?from=${NOW + 1}`)).json.items as unknown[]).length).toBe(0);
	});

	it("a role without the audit permission cannot read the log", async () => {
		expect((await w.call("rita", "GET", `${A}/audit`)).status).toBe(403);
	});
});
