import { beforeEach, describe, expect, it } from "vitest";
import { whatsappNumber } from "./handlers/reminders";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, NOW } from "./testing/world";

const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const owner = (method: string, path: string, body?: unknown) =>
	w.call("olga", method, `${A}${path}`, body);
const err = (r: {
	json: Record<string, unknown>;
}): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };

describe("appointments", () => {
	const book = (extra: Record<string, unknown> = {}) =>
		owner("POST", "/appointments", {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			start: NOW + 5 * HOUR,
			end: NOW + 6 * HOUR,
			...extra,
		});

	it("refuses an end before the start, a session without a client, a group activity without a group", async () => {
		expect((await book({ end: NOW + 4 * HOUR })).status).toBe(400);
		expect((await book({ clientId: undefined })).status).toBe(400);
		expect((await book({ kind: "group", clientId: undefined })).status).toBe(400);
	});

	it("refuses an unknown person, client, room, device or service, naming the field", async () => {
		for (const [field, value] of [
			["practitionerId", "ghost0000001"],
			["clientId", "ghost0000001"],
			["roomId", "ghost0000001"],
			["deviceId", "ghost0000001"],
			["serviceId", "ghost0000001"],
		] as const) {
			const r = await book({ [field]: value });
			expect(r.status, field).toBe(field === "practitionerId" ? 404 : 400);
		}
	});

	it("refuses a double booking of the person, the room or the device, and a cancelled one frees the slot", async () => {
		const first = await book({ roomId: w.ids.room });
		expect((await book({ clientId: w.ids.c2 })).status).toBe(409);
		expect(
			(await book({ practitionerId: w.ids.elena, clientId: w.ids.c2, roomId: w.ids.room })).status,
		).toBe(409);
		await owner("POST", `/appointments/${first.json.id}/cancel`, { reason: "moved" });
		expect((await book({ clientId: w.ids.c2 })).status).toBe(200);
	});

	it("a block of time does not clash and needs no client", async () => {
		expect(
			(
				await book({
					kind: "block",
					clientId: undefined,
					start: NOW + 24 * HOUR,
					end: NOW + 25 * HOUR,
				})
			).status,
		).toBe(200);
	});

	it("moving to another practitioner needs the assign permission and moves the scope with it", async () => {
		const a = (await book()).json.id as string;
		await w.call("olga", "PUT", `${A}/members/dora/overrides`, {
			grant: ["appointments_edit_own"],
			deny: [],
		});
		const denied = await w.call("dora", "PATCH", `${A}/appointments/${a}`, {
			practitionerId: w.ids.elena,
		});
		expect(denied.status).toBe(403);
		expect(err(denied).detail).toMatchObject({ permission: "appointments_assign" });
		await owner("PATCH", `/appointments/${a}`, { practitionerId: w.ids.elena });
		expect((await w.call("dora", "GET", `${A}/appointments/${a}`)).status).toBe(404);
		expect((await w.call("elena", "GET", `${A}/appointments/${a}`)).status).toBe(200);
	});

	it("a cancelled appointment cannot be cancelled again, moved, or marked", async () => {
		const a = (await book()).json.id as string;
		await owner("POST", `/appointments/${a}/cancel`, { reason: "client asked" });
		expect((await owner("POST", `/appointments/${a}/cancel`, { reason: "again" })).status).toBe(
			409,
		);
		expect((await owner("PATCH", `/appointments/${a}`, { note: "x" })).status).toBe(409);
		expect(
			(await owner("POST", `/appointments/${a}/attendance`, { status: "attended" })).status,
		).toBe(409);
	});

	it("payments accumulate on the appointment and set its payment status", async () => {
		const a = (await book({ priceCents: 10_000 })).json.id as string;
		expect(
			(
				(await owner("POST", `/appointments/${a}/payment`, { amountCents: 4000, method: "cash" }))
					.json.money as { paymentStatus: string }
			).paymentStatus,
		).toBe("partial");
		expect(
			(await owner("POST", `/appointments/${a}/payment`, { amountCents: 6000, method: "card" }))
				.json.money,
		).toMatchObject({ paidCents: 10_000, paymentStatus: "paid" });
	});

	it("an appointment price needs the money permission", async () => {
		const r = await w.call("rita", "POST", `${A}/appointments`, {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			start: NOW + 7 * HOUR,
			end: NOW + 8 * HOUR,
			priceCents: 5,
		});
		expect(r.status).toBe(200);
		await w.call("olga", "PUT", `${A}/members/rita/overrides`, {
			grant: [],
			deny: ["appointments_create_all_money"],
		});
		expect(
			(
				await w.call("rita", "POST", `${A}/appointments`, {
					practitionerId: w.ids.dora,
					clientId: w.ids.c1,
					start: NOW + 9 * HOUR,
					end: NOW + 10 * HOUR,
					priceCents: 5,
				})
			).status,
		).toBe(403);
	});

	it("the calendar groups by person, room or device and leaves cancelled visits out", async () => {
		const gone = (await book({ start: NOW + 30 * HOUR, end: NOW + 31 * HOUR, roomId: w.ids.room }))
			.json.id as string;
		await owner("POST", `/appointments/${gone}/cancel`, { reason: "xx" });
		const range = `from=${NOW}&to=${NOW + 3 * 24 * HOUR}`;
		const rooms = (await owner("GET", `/calendar?${range}&columns=room`)).json.columns as {
			id: string;
			appointments: { id: string }[];
		}[];
		expect(rooms.find((c) => c.id === w.ids.room)?.appointments.map((a) => a.id)).not.toContain(
			gone,
		);
		expect(
			((await owner("GET", `/calendar?${range}&columns=device`)).json.columns as unknown[]).length,
		).toBe(1);
	});
});

describe("clients: current, archive, delete, restore", () => {
	const make = async (): Promise<string> =>
		(await owner("POST", "/clients", { name: "Temp Client" })).json.id as string;

	it("archive hides from the current list and shows in the archive; restore brings it back", async () => {
		const id = await make();
		await owner("POST", `/clients/${id}/archive`);
		expect(
			((await owner("GET", "/clients")).json.items as { id: string }[]).some((c) => c.id === id),
		).toBe(false);
		expect(
			((await owner("GET", "/clients?status=archived")).json.items as { id: string }[]).some(
				(c) => c.id === id,
			),
		).toBe(true);
		expect((await owner("POST", `/clients/${id}/restore`)).json.status).toBe("active");
	});

	it("delete is soft for 30 days: recoverable, with the purge date; deleting twice is a conflict", async () => {
		const id = await make();
		const r = await owner("DELETE", `/clients/${id}`);
		expect(r.json).toMatchObject({ status: "deleted", purgeAt: NOW + 30 * 24 * HOUR });
		expect((await owner("DELETE", `/clients/${id}`)).status).toBe(409);
		expect(
			((await owner("GET", "/clients?status=deleted")).json.items as { id: string }[]).map(
				(c) => c.id,
			),
		).toContain(id);
		expect((await owner("POST", `/clients/${id}/restore`)).status).toBe(200);
	});

	it("an archived client cannot be archived again; an active one cannot be restored", async () => {
		const id = await make();
		expect((await owner("POST", `/clients/${id}/restore`)).status).toBe(409);
		await owner("POST", `/clients/${id}/archive`);
		expect((await owner("POST", `/clients/${id}/archive`)).status).toBe(409);
	});

	it("searches by name and pages with a cursor", async () => {
		expect(((await owner("GET", "/clients?q=two")).json.items as unknown[]).length).toBe(1);
		const page = (await owner("GET", "/clients?limit=1")).json as {
			items: unknown[];
			nextCursor?: string;
		};
		expect(page.items).toHaveLength(1);
		const next = (await owner("GET", `/clients?limit=1&cursor=${page.nextCursor}`)).json as {
			items: { name: string }[];
			nextCursor?: string;
		};
		expect(next.items).toHaveLength(1);
		expect(next.nextCursor).toBeUndefined();
		expect((await owner("GET", "/clients?cursor=!!")).status).toBe(400);
	});

	it("merges a group patch instead of replacing it, and keeps the clinical content sealed", async () => {
		await owner("PATCH", `/clients/${w.ids.c1}`, {
			clinical: { notes: "new notes" },
			contact: { phone: "0799 111 222" },
		});
		const c = (await owner("GET", `/clients/${w.ids.c1}`)).json;
		expect(c.clinical).toEqual({ diagnosis: "synthetic-diagnosis-one", notes: "new notes" });
		expect(c.contact).toMatchObject({ phone: "0799 111 222", email: "one@example.test" });
	});
});

describe("packages and payments: totals are computed", () => {
	it("total, paid, remaining and sessions left follow the ledger and the visits", async () => {
		const p = (await owner("GET", `/packages/${w.ids.pkg}`)).json.package as Record<string, number>;
		expect(p).toMatchObject({
			priceCents: 120_000,
			discountCents: 10_000,
			totalCents: 110_000,
			paidCents: 50_000,
			remainingCents: 60_000,
			sessionsRemaining: 11,
			used: 0,
		});
		await owner("PATCH", `/appointments/${w.ids.a1}`, { packageId: w.ids.pkg });
		await owner("POST", `/appointments/${w.ids.a1}/attendance`, { status: "attended" });
		expect(
			(
				(await owner("GET", `/clients/${w.ids.c1}/packages`)).json.items as Record<string, number>[]
			)[0],
		).toMatchObject({ used: 1, sessionsRemaining: 10 });
	});

	it("an offer larger than the price, an overpayment and fewer sessions than used are refused", async () => {
		expect(
			(await owner("PATCH", `/packages/${w.ids.pkg}`, { discountCents: 999_999 })).status,
		).toBe(400);
		const over = await owner("POST", `/packages/${w.ids.pkg}/payments`, {
			amountCents: 60_001,
			method: "cash",
		});
		expect(over.status).toBe(409);
		expect(err(over).detail).toMatchObject({ remainingCents: 60_000 });
		await owner("PATCH", `/appointments/${w.ids.a1}`, { packageId: w.ids.pkg });
		await owner("POST", `/appointments/${w.ids.a1}/attendance`, { status: "attended" });
		await owner("PATCH", `/appointments/${w.ids.a2}`, { packageId: w.ids.pkg });
		await owner("POST", `/appointments/${w.ids.a2}/attendance`, { status: "attended" });
		expect((await owner("PATCH", `/packages/${w.ids.pkg}`, { sessions: 1, bonus: 0 })).status).toBe(
			409,
		);
	});

	it("a package with payments is kept; deleting a payment is audited and the balance follows", async () => {
		expect((await owner("DELETE", `/packages/${w.ids.pkg}`)).status).toBe(409);
		await owner("DELETE", `/payments/${w.ids.payment}`);
		expect(
			((await owner("GET", `/packages/${w.ids.pkg}`)).json.package as { paidCents: number })
				.paidCents,
		).toBe(0);
		expect(
			((await owner("GET", "/audit?action=payment.delete")).json.items as unknown[]).length,
		).toBe(1);
	});

	it("a patch leaves the fields it does not mention alone", async () => {
		await owner("PATCH", `/packages/${w.ids.pkg}`, { name: "Renamed" });
		expect((await owner("GET", `/packages/${w.ids.pkg}`)).json.package).toMatchObject({
			name: "Renamed",
			bonus: 1,
			discountCents: 10_000,
		});
	});

	it("only an active client takes a package", async () => {
		await owner("POST", `/clients/${w.ids.c2}/archive`);
		expect(
			(
				await owner("POST", `/clients/${w.ids.c2}/packages`, {
					name: "x",
					sessions: 1,
					priceCents: 1,
				})
			).status,
		).toBe(409);
	});
});

describe("roster and leave", () => {
	it("a work day needs hours; leave approved lands on the roster as leave, day by day", async () => {
		expect((await owner("PUT", `/roster/${w.ids.dora}/2026-11-16`, { kind: "work" })).status).toBe(
			400,
		);
		await owner("POST", `/leave/${w.ids.leave}/decision`, { decision: "approved" });
		const days = (await owner("GET", "/roster?from=2026-12-01&to=2026-12-03")).json.items as {
			date: string;
			kind: string;
		}[];
		expect(days.map((d) => `${d.date}:${d.kind}`)).toEqual([
			"2026-12-01:leave_co",
			"2026-12-02:leave_co",
			"2026-12-03:leave_co",
		]);
	});

	it("a leave request is decided once; rejected leaves the roster alone", async () => {
		await owner("POST", `/leave/${w.ids.leave}/decision`, { decision: "rejected" });
		expect(
			(await owner("POST", `/leave/${w.ids.leave}/decision`, { decision: "approved" })).status,
		).toBe(409);
		expect(
			((await owner("GET", "/roster?from=2026-12-01&to=2026-12-03")).json.items as unknown[])
				.length,
		).toBe(0);
	});

	it("refuses leave that ends before it starts or lasts over 62 days; a roster day is replaced, not duplicated", async () => {
		expect(
			(
				await owner("POST", "/leave", {
					personId: w.ids.dora,
					from: "2026-12-05",
					to: "2026-12-01",
					kind: "co",
				})
			).status,
		).toBe(400);
		expect(
			(
				await owner("POST", "/leave", {
					personId: w.ids.dora,
					from: "2026-12-01",
					to: "2027-03-01",
					kind: "co",
				})
			).status,
		).toBe(400);
		await owner("PUT", `/roster/${w.ids.dora}/2026-11-17`, { kind: "free" });
		await owner("PUT", `/roster/${w.ids.dora}/2026-11-17`, { kind: "work", start: 600, end: 900 });
		expect(
			(
				(await owner("GET", "/roster?from=2026-11-17&to=2026-11-17")).json.items as {
					kind: string;
				}[]
			).map((d) => d.kind),
		).toEqual(["work"]);
	});

	it("a volunteer sees the roster and cannot edit it", async () => {
		expect((await w.call("vera", "GET", `${A}/roster?from=2026-11-01&to=2026-11-30`)).status).toBe(
			200,
		);
		expect(
			(await w.call("vera", "PUT", `${A}/roster/${w.ids.dora}/2026-11-18`, { kind: "free" }))
				.status,
		).toBe(404);
	});
});

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
