import { FileInitResult, ROUTES, type RouteId, type RouteSpec } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXTRA_HAPPY, type ExtraId } from "./happy-extra";
import type { Populated } from "./testing/populate";
import { HOUR, NOW, type Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

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
/** An appointment of its own to delete, so the shared fixtures stay as the other cases expect them. */
const spare = async (w: Populated): Promise<string> =>
	String(
		(
			await olga(w, "POST", "/appointments", {
				kind: "block",
				practitionerId: w.ids.elena,
				start: NOW + 6 * 24 * HOUR,
				end: NOW + 6 * 24 * HOUR + HOUR,
			})
		).json.id,
	);
/** A note of its own for a case that changes or removes one. */
const spareNote = async (w: Populated): Promise<string> =>
	String(
		(await olga(w, "POST", `/clients/${w.ids.c1}/notes`, { category: "general", text: "a note" }))
			.json.id,
	);
/** A week of the populated clinic, for the reports. */
const REPORT_RANGE = `?from=${NOW}&to=${NOW + 7 * 24 * HOUR}`;
let spareSeriesAt = 0;
/** A series of two appointments, a day further on each time so that no two meet. */
const spareSeries = async (w: Populated): Promise<string> =>
	String(
		(
			await olga(w, "POST", "/series", {
				practitionerId: w.ids.dora,
				clientId: w.ids.c1,
				start: NOW + (400 + 24 * ++spareSeriesAt) * HOUR,
				end: NOW + (401 + 24 * spareSeriesAt) * HOUR,
				recurrence: { count: 2 },
			})
		).json.seriesId,
	);
const newClient = async (w: Populated): Promise<string> =>
	String((await olga(w, "POST", "/clients", { name: "Disposable Client" })).json.id);

/** One happy path per route of the contract. The table's type is the contract's ids: a route without a case does not compile. */
const OWN: Record<
	Exclude<RouteId, "calendar.stream" | "requests.stream" | "inbox.stream" | ExtraId>,
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
	"me.capabilities": (w) => w.call("rita", "GET", `${A}/me`),
	"viewAs.start": (w) =>
		w.call("root", "POST", `${A}/view-as`, { as: `role:${w.ids.roles.reception}` }),
	"viewAs.stop": (w) => w.call("root", "DELETE", `${A}/view-as`),
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
	"members.get": (w) => olga(w, "GET", "/members/rita"),
	"members.put": (w) =>
		olga(w, "PUT", "/members/newcomer", {
			displayName: "Newcomer",
			roles: [w.ids.roles.reception],
			coordinates: [],
		}),
	"members.overrides": (w) =>
		olga(w, "PUT", "/members/rita/overrides", {
			grant: ["audit_log_view_all"],
			deny: ["clients_delete_all"],
		}),
	"members.remove": async (w) => {
		await olga(w, "PUT", "/members/leaver", { displayName: "Leaver", roles: [], coordinates: [] });
		return olga(w, "DELETE", "/members/leaver");
	},
	"roles.list": (w) => olga(w, "GET", "/roles"),
	"roles.summary": (w) => w.call("rita", "GET", `${A}/role-summary`),
	"roles.create": (w) =>
		olga(w, "POST", "/roles", { name: "Intern", copyFrom: w.ids.roles.volunteer }),
	"roles.get": (w) => olga(w, "GET", `/roles/${w.ids.roles.reception}`),
	"roles.update": (w) =>
		olga(w, "PATCH", `/roles/${w.ids.roles.accountant}`, { description: "Money, read-only." }),
	"roles.setPermissions": async (w) => {
		const r = await olga(w, "POST", "/roles", { name: "Temp" });
		return olga(w, "PUT", `/roles/${r.json.id}/permissions`, {
			permissions: ["clients_view_all", "calendars_view_all"],
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
	// At 22:00 in Bucharest, two days on: an hour no online booking can take, whatever the backend's own clock picks
	// as the visitors' first free slot in the cases before this one.
	"appointments.create": (w) =>
		olga(w, "POST", "/appointments", {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			start: NOW + 60 * HOUR,
			end: NOW + 61 * HOUR,
		}),
	"appointments.get": (w) => olga(w, "GET", `/appointments/${w.ids.a1}`),
	"appointments.update": (w) =>
		olga(w, "PATCH", `/appointments/${w.ids.a1}`, { note: "bring the book" }),
	"appointments.confirm": async (w) => {
		const a = await olga(w, "POST", "/appointments", {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			start: NOW + 96 * HOUR,
			end: NOW + 97 * HOUR,
			status: "requested",
		});
		return olga(w, "POST", `/appointments/${a.json.id}/confirm`);
	},
	"reports.appointments": (w) => olga(w, "GET", `/reports/appointments${REPORT_RANGE}`),
	"reports.utilisation": (w) => olga(w, "GET", `/reports/utilisation${REPORT_RANGE}`),
	"reports.rates": (w) => olga(w, "GET", `/reports/rates${REPORT_RANGE}&byClient=true`),
	"reports.clients": (w) => olga(w, "GET", `/reports/clients${REPORT_RANGE}`),
	"reports.packages": (w) => olga(w, "GET", `/reports/packages${REPORT_RANGE}`),
	"reports.funnel": (w) => olga(w, "GET", `/reports/funnel${REPORT_RANGE}`),
	"reports.ratings": (w) => olga(w, "GET", `/reports/ratings${REPORT_RANGE}`),
	"reports.blacklistHits": (w) => olga(w, "GET", `/reports/blacklist-hits${REPORT_RANGE}`),
	"reports.revenue": (w) => olga(w, "GET", `/reports/revenue${REPORT_RANGE}`),
	"reports.csv": (w) => olga(w, "GET", `/reports/rates/csv${REPORT_RANGE}`),
	"notes.list": (w) => olga(w, "GET", `/clients/${w.ids.c1}/notes`),
	"notes.pinned": (w) => olga(w, "GET", `/notes/pinned?clients=${w.ids.c1},${w.ids.c2}`),
	"notes.create": (w) =>
		olga(w, "POST", `/clients/${w.ids.c1}/notes`, { category: "plata", text: "pays by card" }),
	"notes.update": async (w) =>
		olga(w, "PATCH", `/notes/${await spareNote(w)}`, { text: "changed" }),
	"notes.pin": async (w) => olga(w, "POST", `/notes/${await spareNote(w)}/pin`, { pinned: true }),
	"notes.remove": async (w) => olga(w, "DELETE", `/notes/${await spareNote(w)}`),
	"series.create": (w) =>
		olga(w, "POST", "/series", {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			start: NOW + 120 * HOUR,
			end: NOW + 121 * HOUR,
			recurrence: { count: 3 },
		}),
	"series.get": async (w) => olga(w, "GET", `/series/${await spareSeries(w)}`),
	"series.update": async (w) => {
		const id = await spareSeries(w);
		const items = (await olga(w, "GET", `/series/${id}`)).json.items as { id: string }[];
		return olga(w, "PATCH", `/series/${id}`, {
			occurrenceId: items[0]?.id,
			scope: "all",
			note: "bring the book",
		});
	},
	"series.cancel": async (w) => {
		const id = await spareSeries(w);
		const items = (await olga(w, "GET", `/series/${id}`)).json.items as { id: string }[];
		return olga(w, "POST", `/series/${id}/cancel`, {
			occurrenceId: items[0]?.id,
			scope: "all",
			reason: "client asked",
		});
	},
	"appointments.attendance": (w) =>
		olga(w, "POST", `/appointments/${w.ids.a1}/attendance`, { status: "attended" }),
	"appointments.remove": async (w) => olga(w, "DELETE", `/appointments/${await spare(w)}`),
	"appointments.restore": async (w) => {
		const id = await spare(w);
		await olga(w, "DELETE", `/appointments/${id}`);
		return olga(w, "POST", `/appointments/${id}/restore`);
	},
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
	"files.complete": async (w) => {
		const made = FileInitResult.parse(
			(
				await olga(w, "POST", `/clients/${w.ids.c1}/files`, {
					name: "x.png",
					contentType: "image/png",
					size: 5,
				})
			).json,
		);
		await w.objects.upload(made.upload.url, 5, "image/png");
		return olga(w, "POST", `/files/${made.file.id}/complete`);
	},
	"files.download": (w) => olga(w, "GET", `/files/${w.ids.file}/download`),
	"files.remove": async (w) =>
		olga(
			w,
			"DELETE",
			`/files/${((await olga(w, "POST", `/clients/${w.ids.c1}/files`, { name: "y.png", contentType: "image/png", size: 5 })).json.file as { id: string }).id}?confirm=true`,
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

const HAPPY = { ...OWN, ...EXTRA_HAPPY };

const factories = await worldFactories();

describe.each(
	factories,
)("every route of the contract answers its happy path on $name", (factory) => {
	let world: Populated;
	beforeAll(async () => {
		world = await factory.create();
	});
	afterAll(async () => {
		await factory.cleanup();
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
