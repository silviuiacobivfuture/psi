import { ROUTES, type RouteId, type RouteSpec } from "@psi/scheduling-sdk/contract";
import { beforeAll, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, NOW, type Reply } from "./testing/world";

const A = "/v1/apps/psizone";
type Case = (w: Populated) => Promise<Reply>;
const olga = (w: Populated, method: string, path: string, body?: unknown): Promise<Reply> =>
	w.call("olga", method, `${A}${path}`, body);
const key = (
	w: Populated,
	method: string,
	path: string,
	body?: unknown,
	subject?: string,
): Promise<Reply> =>
	w.callKey(
		"psizone-web",
		method,
		`${A}${path}`,
		body,
		subject === undefined ? {} : { "x-psi-subject": subject },
	);

async function firstSlot(w: Populated): Promise<{ practitioner: string; start: number }> {
	const r = await key(
		w,
		"GET",
		`/book/slots?service=evaluation&from=${NOW}&to=${NOW + 10 * 24 * HOUR}&limit=5`,
	);
	const slots = r.json.slots as { practitioner: string; start: number }[];
	const first = slots[0];
	if (first === undefined)
		throw new Error(`no slot offered ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
	return first;
}
async function hold(w: Populated): Promise<{ reference: string; holdToken: string }> {
	const slot = await firstSlot(w);
	const r = await key(w, "POST", "/book/holds", {
		service: "evaluation",
		practitioner: slot.practitioner,
		start: slot.start,
		mode: "onsite",
		locale: "ro",
		channel: "form",
	});
	return { reference: String(r.json.reference), holdToken: String(r.json.holdToken) };
}
async function submitted(
	w: Populated,
	subject?: string,
): Promise<{ reference: string; cancelCode: string }> {
	const h = await hold(w);
	const r = await key(
		w,
		"POST",
		`/book/holds/${h.reference}/submit`,
		{ holdToken: h.holdToken, contact: { name: "Visitor Test", email: "visitor@example.test" } },
		subject,
	);
	return { reference: String(r.json.reference), cancelCode: String(r.json.cancelCode) };
}
const newClient = async (w: Populated): Promise<string> =>
	String((await olga(w, "POST", "/clients", { name: "Disposable Client" })).json.id);

/** One happy path per route of the contract. The table's type is the contract's ids: a route without a case does not compile. */
const HAPPY: Record<
	Exclude<RouteId, "calendar.stream" | "requests.stream" | "inbox.stream">,
	Case
> = {
	"meta.health": (w) => w.call(null, "GET", "/health"),
	"meta.openapi": (w) => w.call(null, "GET", "/v1/openapi.json"),
	"visitor.services": (w) => key(w, "GET", "/book/services"),
	"visitor.slots": (w) =>
		key(w, "GET", `/book/slots?service=evaluation&from=${NOW}&to=${NOW + 7 * 24 * HOUR}`),
	"visitor.hold": async (w) => {
		const slot = await firstSlot(w);
		return key(w, "POST", "/book/holds", {
			service: "evaluation",
			practitioner: slot.practitioner,
			start: slot.start,
			mode: "onsite",
			locale: "en",
			channel: "guide",
		});
	},
	"visitor.release": async (w) => {
		const h = await hold(w);
		return key(w, "POST", `/book/holds/${h.reference}/release`, { holdToken: h.holdToken });
	},
	"visitor.submit": async (w) => {
		const h = await hold(w);
		return key(w, "POST", `/book/holds/${h.reference}/submit`, {
			holdToken: h.holdToken,
			contact: { name: "Visitor Test", phone: "0733 000 111" },
			audience: "adult",
		});
	},
	"visitor.cancel": async (w) => {
		const s = await submitted(w);
		return key(w, "POST", `/book/requests/${s.reference}/cancel`, { cancelCode: s.cancelCode });
	},
	"visitor.callback": (w) =>
		key(w, "POST", "/book/callback-requests", {
			contact: { name: "Caller Test", phone: "0733 000 222" },
			locale: "ro",
		}),
	"visitor.mine": async (w) => {
		await submitted(w, "visitor-1");
		return key(w, "GET", "/me/appointments", undefined, "visitor-1");
	},
	"visitor.mineCancel": async (w) => {
		await submitted(w, "visitor-2");
		const mine = await key(w, "GET", "/me/appointments", undefined, "visitor-2");
		return key(
			w,
			"POST",
			`/me/appointments/${(mine.json.items as { id: string }[])[0]?.id}/cancel`,
			undefined,
			"visitor-2",
		);
	},
	"me.get": (w) => w.call("rita", "GET", "/v1/me"),
	"apps.create": (w) =>
		w.call("root", "POST", "/v1/apps", {
			id: "newapp",
			name: "New App",
			timeZone: "Europe/Bucharest",
			ownerSubject: "newowner",
		}),
	"apps.get": (w) => olga(w, "GET", ""),
	"apps.update": (w) => olga(w, "PATCH", "", { name: "Psizone Galați" }),
	"members.list": (w) => olga(w, "GET", "/members"),
	"members.put": (w) =>
		olga(w, "PUT", "/members/newcomer", {
			displayName: "Newcomer",
			roles: ["psizone-reception"],
			coordinates: [],
		}),
	"members.overrides": (w) =>
		olga(w, "PUT", "/members/rita/overrides", { grant: ["audit_view"], deny: ["clients_delete"] }),
	"members.remove": async (w) => {
		await olga(w, "PUT", "/members/leaver", { displayName: "Leaver", roles: [], coordinates: [] });
		return olga(w, "DELETE", "/members/leaver");
	},
	"roles.list": (w) => olga(w, "GET", "/roles"),
	"roles.create": (w) =>
		olga(w, "POST", "/roles", { name: "Intern", copyFrom: "psizone-volunteer" }),
	"roles.get": (w) => olga(w, "GET", "/roles/psizone-reception"),
	"roles.update": (w) =>
		olga(w, "PATCH", "/roles/psizone-accountant", { description: "Money, read-only." }),
	"roles.setPermissions": async (w) => {
		const r = await olga(w, "POST", "/roles", { name: "Temp" });
		return olga(w, "PUT", `/roles/${r.json.id}/permissions`, {
			permissions: ["clients_view_all", "calendar_view_all"],
		});
	},
	"roles.remove": async (w) =>
		olga(w, "DELETE", `/roles/${(await olga(w, "POST", "/roles", { name: "Gone" })).json.id}`),
	"people.list": (w) => olga(w, "GET", "/people"),
	"people.create": (w) =>
		olga(w, "POST", "/people", { displayName: "Vera Test", kind: "volunteer" }),
	"people.update": (w) => olga(w, "PATCH", `/people/${w.ids.mara}`, { color: "#aabbcc" }),
	"people.remove": async (w) =>
		olga(
			w,
			"DELETE",
			`/people/${(await olga(w, "POST", "/people", { displayName: "Temp", kind: "staff" })).json.id}`,
		),
	"rooms.list": (w) => olga(w, "GET", "/rooms"),
	"rooms.create": (w) =>
		olga(w, "POST", "/rooms", { name: "Room Two", kind: "group", capacity: 8 }),
	"rooms.update": (w) => olga(w, "PATCH", `/rooms/${w.ids.room}`, { capacity: 4 }),
	"rooms.remove": async (w) =>
		olga(
			w,
			"DELETE",
			`/rooms/${(await olga(w, "POST", "/rooms", { name: "Temp", kind: "x" })).json.id}`,
		),
	"devices.list": (w) => olga(w, "GET", "/devices"),
	"devices.create": (w) => olga(w, "POST", "/devices", { name: "Device Two" }),
	"devices.update": (w) => olga(w, "PATCH", `/devices/${w.ids.device}`, { name: "Device One B" }),
	"devices.remove": async (w) =>
		olga(w, "DELETE", `/devices/${(await olga(w, "POST", "/devices", { name: "Temp" })).json.id}`),
	"groups.list": (w) => olga(w, "GET", "/groups"),
	"groups.create": (w) => olga(w, "POST", "/groups", { name: "Atelier", kind: "atelier" }),
	"groups.update": (w) => olga(w, "PATCH", `/groups/${w.ids.group}`, { name: "Group One B" }),
	"groups.remove": async (w) =>
		olga(
			w,
			"DELETE",
			`/groups/${(await olga(w, "POST", "/groups", { name: "Temp", kind: "group" })).json.id}`,
		),
	"services.list": (w) => olga(w, "GET", "/services"),
	"services.create": (w) =>
		olga(w, "POST", "/services", {
			slug: "followup",
			name: { ro: "Ședință", en: "Session" },
			durationMinutes: 45,
			modes: ["onsite"],
		}),
	"services.update": (w) => olga(w, "PATCH", `/services/${w.ids.service}`, { bufferMinutes: 10 }),
	"services.setPrice": (w) =>
		olga(w, "PUT", `/services/${w.ids.service}/price`, { priceCents: 26_000, currency: "RON" }),
	"services.remove": async (w) =>
		olga(
			w,
			"DELETE",
			`/services/${(await olga(w, "POST", "/services", { slug: "temp", name: { ro: "T", en: "T" }, durationMinutes: 30, modes: ["online"] })).json.id}`,
		),
	"calendar.get": (w) =>
		olga(w, "GET", `/calendar?from=${NOW}&to=${NOW + 3 * 24 * HOUR}&columns=person`),
	"appointments.list": (w) => olga(w, "GET", `/appointments?from=${NOW}&to=${NOW + 3 * 24 * HOUR}`),
	"appointments.create": (w) =>
		olga(w, "POST", "/appointments", {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			start: NOW + 48 * HOUR,
			end: NOW + 49 * HOUR,
		}),
	"appointments.get": (w) => olga(w, "GET", `/appointments/${w.ids.a1}`),
	"appointments.update": (w) =>
		olga(w, "PATCH", `/appointments/${w.ids.a1}`, { note: "bring the book" }),
	"appointments.attendance": (w) =>
		olga(w, "POST", `/appointments/${w.ids.a1}/attendance`, { status: "attended" }),
	"appointments.pay": (w) =>
		olga(w, "POST", `/appointments/${w.ids.a2}/payment`, { amountCents: 5000, method: "card" }),
	"appointments.cancel": async (w) => {
		const a = await olga(w, "POST", "/appointments", {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			start: NOW + 72 * HOUR,
			end: NOW + 73 * HOUR,
		});
		return olga(w, "POST", `/appointments/${a.json.id}/cancel`, { reason: "client asked" });
	},
	"clients.list": (w) => olga(w, "GET", "/clients"),
	"clients.create": (w) =>
		olga(w, "POST", "/clients", { name: "Client Three", contact: { email: "three@example.test" } }),
	"clients.get": (w) => olga(w, "GET", `/clients/${w.ids.c1}`),
	"clients.update": (w) => olga(w, "PATCH", `/clients/${w.ids.c1}`, { name: "Client One B" }),
	"clients.assign": (w) =>
		olga(w, "PUT", `/clients/${w.ids.c1}/treating`, {
			treating: [w.ids.dora, w.ids.elena],
			reason: "second therapist added",
		}),
	"clients.archive": async (w) => olga(w, "POST", `/clients/${await newClient(w)}/archive`),
	"clients.restore": async (w) => {
		const id = await newClient(w);
		await olga(w, "POST", `/clients/${id}/archive`);
		return olga(w, "POST", `/clients/${id}/restore`);
	},
	"clients.remove": async (w) => olga(w, "DELETE", `/clients/${await newClient(w)}`),
	"packages.list": (w) => olga(w, "GET", `/clients/${w.ids.c1}/packages`),
	"packages.create": (w) =>
		olga(w, "POST", `/clients/${w.ids.c2}/packages`, {
			name: "5 sessions",
			sessions: 5,
			priceCents: 60_000,
		}),
	"packages.get": (w) => olga(w, "GET", `/packages/${w.ids.pkg}`),
	"packages.update": (w) => olga(w, "PATCH", `/packages/${w.ids.pkg}`, { bonus: 2 }),
	"packages.remove": async (w) =>
		olga(
			w,
			"DELETE",
			`/packages/${(await olga(w, "POST", `/clients/${w.ids.c2}/packages`, { name: "Temp", sessions: 1, priceCents: 1000 })).json.id}`,
		),
	"payments.create": (w) =>
		olga(w, "POST", `/packages/${w.ids.pkg}/payments`, {
			amountCents: 10_000,
			method: "transfer",
			note: "second instalment",
		}),
	"payments.remove": async (w) => olga(w, "DELETE", `/payments/${w.ids.payment}`),
	"roster.get": (w) => olga(w, "GET", "/roster?from=2026-11-01&to=2026-11-30"),
	"roster.put": (w) =>
		olga(w, "PUT", `/roster/${w.ids.dora}/2026-11-16`, { kind: "work", start: 540, end: 1020 }),
	"leave.list": (w) => olga(w, "GET", "/leave"),
	"leave.create": (w) =>
		olga(w, "POST", "/leave", {
			personId: w.ids.elena,
			from: "2026-12-10",
			to: "2026-12-11",
			kind: "cm",
		}),
	"leave.decide": (w) =>
		olga(w, "POST", `/leave/${w.ids.leave}/decision`, { decision: "approved" }),
	"reminders.list": (w) => olga(w, "GET", "/reminders"),
	"reminders.mark": (w) => olga(w, "POST", `/reminders/${w.ids.a1}/state`, { state: "confirmed" }),
	"reminders.email": (w) => olga(w, "POST", `/reminders/${w.ids.a2}/email`, { locale: "ro" }),
	"reminders.whatsapp": (w) => olga(w, "GET", `/reminders/${w.ids.a1}/whatsapp?locale=ro`),
	"requests.list": async (w) => {
		await submitted(w);
		return olga(w, "GET", `/requests?from=${NOW}&to=${NOW + 30 * 24 * HOUR}`);
	},
	"requests.decide": async (w) => {
		const s = await submitted(w);
		return olga(w, "POST", `/requests/${s.reference}/decision`, { decision: "confirm" });
	},
	"records.list": (w) => olga(w, "GET", `/clients/${w.ids.c1}/records`),
	"records.create": (w) =>
		olga(w, "POST", `/clients/${w.ids.c1}/records`, {
			formId: w.ids.form,
			data: { summary: "second synthetic summary" },
		}),
	"records.get": (w) => olga(w, "GET", `/records/${w.ids.record}`),
	"records.update": (w) =>
		olga(w, "PATCH", `/records/${w.ids.record}`, { data: { summary: "edited synthetic summary" } }),
	"records.remove": async (w) =>
		olga(
			w,
			"DELETE",
			`/records/${(await olga(w, "POST", `/clients/${w.ids.c1}/records`, { formId: w.ids.form, data: { summary: "temp" } })).json.id}`,
		),
	"files.list": (w) => olga(w, "GET", `/clients/${w.ids.c1}/files`),
	"files.init": (w) =>
		olga(w, "POST", `/clients/${w.ids.c1}/files`, {
			name: "scan.png",
			contentType: "image/png",
			size: 2048,
		}),
	"files.complete": async (w) =>
		olga(
			w,
			"POST",
			`/files/${((await olga(w, "POST", `/clients/${w.ids.c1}/files`, { name: "x.png", contentType: "image/png", size: 5 })).json.file as { id: string }).id}/complete`,
		),
	"files.download": (w) => olga(w, "GET", `/files/${w.ids.file}/download`),
	"files.remove": async (w) =>
		olga(
			w,
			"DELETE",
			`/files/${((await olga(w, "POST", `/clients/${w.ids.c1}/files`, { name: "y.png", contentType: "image/png", size: 5 })).json.file as { id: string }).id}`,
		),
	"audit.list": (w) => olga(w, "GET", "/audit"),
	"builder.list": (w) => olga(w, "GET", "/builder/forms"),
	"builder.put": (w) =>
		olga(w, "PUT", "/builder/fields/note", {
			name: { ro: "Notă", en: "Note" },
			body: { entity: "client", key: "note", type: "long_text", group: "clinical" },
		}),
	"builder.remove": async (w) => {
		await olga(w, "PUT", "/builder/views/calendar-default", {
			name: { ro: "Calendar", en: "Calendar" },
			body: { columns: ["person"] },
		});
		return olga(w, "DELETE", "/builder/views/calendar-default");
	},
	"imports.list": (w) => olga(w, "GET", "/imports"),
};

describe("every route of the contract answers its happy path", () => {
	let world: Populated;
	beforeAll(async () => {
		world = await createWorld();
	});
	const specs = (ROUTES as ReadonlyArray<RouteSpec>).filter((r) => r.stream !== true);

	it("has a case for every route, and no case for a route that is gone", () => {
		expect(Object.keys(HAPPY).sort()).toEqual(specs.map((r) => r.id).sort());
	});

	it.each(specs.map((r) => [r.id] as const))("%s", async (id) => {
		const run = HAPPY[id as keyof typeof HAPPY];
		const reply = await run(world);
		expect(reply.status, JSON.stringify(reply.json)).toBe(200);
		expect(reply.headers.get("cache-control")).toBe("no-store");
	});
});
