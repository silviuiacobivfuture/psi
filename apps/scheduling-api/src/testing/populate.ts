import { FileInitResult } from "@psi/scheduling-sdk/contract";
import { createBareWorld, HOUR, NOW, type Reply, type World, type WorldOptions } from "./world";

export interface Ids {
	dora: string;
	elena: string;
	mara: string;
	c1: string;
	c2: string;
	room: string;
	device: string;
	service: string;
	a1: string;
	a2: string;
	pkg: string;
	payment: string;
	group: string;
	leave: string;
	form: string;
	record: string;
	file: string;
	roles: Record<string, string>;
}

export interface Populated extends World {
	ids: Ids;
}

/** Local or test: the team that runs a clinic, as synthetic as can be (no real name, phone or e-mail). */
export const PEOPLE = {
	olga: "owner",
	nina: "admin",
	rita: "reception",
	dora: "therapist",
	elena: "therapist",
	cora: "coordinator",
	ana: "accountant",
	vera: "volunteer",
} as const;

export function ok(reply: Reply, what: string): Record<string, unknown> {
	if (reply.status >= 300)
		throw new Error(`${what} answered ${reply.status} ${JSON.stringify(reply.json)}`);
	return reply.json;
}
const str = (v: unknown): string => {
	if (typeof v !== "string") throw new Error("expected a string id");
	return v;
};

/** Populates through the API itself, so the tuples, the audit log and the change feed are as real as in service. */
export async function populate<T extends Pick<World, "call">>(world: T): Promise<T & { ids: Ids }> {
	const { call } = world;
	ok(
		await call("root", "POST", "/v1/apps", {
			id: "psizone",
			name: "Psizone",
			timeZone: "Europe/Bucharest",
			ownerSubject: "olga",
		}),
		"app",
	);
	ok(
		await call("root", "POST", "/v1/apps", {
			id: "hemisync",
			name: "Hemi-Sync",
			timeZone: "Europe/Bucharest",
			ownerSubject: "hugo",
		}),
		"hemisync",
	);
	const base = "/v1/apps/psizone";
	const owner = (method: string, path: string, body?: unknown) =>
		call("olga", method, `${base}${path}`, body);
	// Role ids belong to the store (Convex assigns them): found by the seed role's name.
	const seeded = ok(await owner("GET", "/roles"), "roles").items as { id: string; name: string }[];
	const roles = Object.fromEntries(seeded.map((r) => [r.name.toLowerCase(), r.id]));

	const dora = str(
		ok(
			await owner("POST", "/people", {
				displayName: "Dora Test",
				kind: "practitioner",
				subject: "dora",
			}),
			"dora",
		).id,
	);
	const elena = str(
		ok(
			await owner("POST", "/people", {
				displayName: "Elena Test",
				kind: "practitioner",
				subject: "elena",
			}),
			"elena",
		).id,
	);
	const mara = str(
		ok(await owner("POST", "/people", { displayName: "Mara Test", kind: "reception" }), "mara").id,
	);
	for (const [subject, role] of Object.entries(PEOPLE)) {
		if (subject === "olga") continue;
		ok(
			await owner("PUT", `/members/${subject}`, {
				displayName: `${subject} test`,
				roles: [roles[role] ?? role],
				coordinates: subject === "cora" ? [dora, elena] : [],
			}),
			`member ${subject}`,
		);
	}
	const room = str(
		ok(await owner("POST", "/rooms", { name: "Room One", kind: "therapy" }), "room").id,
	);
	const device = str(
		ok(await owner("POST", "/devices", { name: "Device One", roomId: room }), "device").id,
	);
	const service = str(
		ok(
			await owner("POST", "/services", {
				slug: "evaluation",
				name: { ro: "Evaluare", en: "Evaluation" },
				durationMinutes: 60,
				bufferMinutes: 15,
				modes: ["onsite", "online"],
				practitionerIds: [dora, elena],
			}),
			"service",
		).id,
	);
	ok(
		await owner("PUT", `/services/${service}/price`, { priceCents: 25_000, currency: "RON" }),
		"price",
	);

	const client = async (name: string, treating: string[], tag: string) =>
		str(
			ok(
				await owner("POST", "/clients", {
					name,
					birthYear: 2016,
					treating,
					contact: { phone: "0712 345 678", email: `${tag}@example.test` },
					guardian: { name: `Guardian of ${tag}`, phone: "0722 111 222", relationship: "parent" },
					money: { tariffCents: 15_000 },
					clinical: { diagnosis: `synthetic-diagnosis-${tag}`, notes: `synthetic-notes-${tag}` },
				}),
				name,
			).id,
		);
	const c1 = await client("Client One", [dora], "one");
	const c2 = await client("Client Two", [elena], "two");

	const tomorrow = NOW + 24 * HOUR;
	const appointment = async (
		practitionerId: string,
		clientId: string,
		start: number,
		priceCents: number,
	) =>
		str(
			ok(
				await owner("POST", "/appointments", {
					practitionerId,
					clientId,
					start,
					end: start + HOUR,
					roomId: room,
					priceCents,
					serviceId: service,
				}),
				"appointment",
			).id,
		);
	const a1 = await appointment(dora, c1, tomorrow, 15_000);
	const a2 = await appointment(elena, c2, tomorrow + 2 * HOUR, 15_000);

	const pkg = str(
		ok(
			await owner("POST", `/clients/${c1}/packages`, {
				name: "10 sessions",
				sessions: 10,
				bonus: 1,
				priceCents: 120_000,
				discountCents: 10_000,
			}),
			"package",
		).id,
	);
	const payment = str(
		ok(
			await owner("POST", `/packages/${pkg}/payments`, { amountCents: 50_000, method: "cash" }),
			"payment",
		).id,
	);
	const group = str(
		ok(
			await owner("POST", "/groups", { name: "Group One", kind: "group", clientIds: [c1, c2] }),
			"group",
		).id,
	);
	const leave = str(
		ok(
			await call("dora", "POST", `${base}/leave`, {
				personId: dora,
				from: "2026-12-01",
				to: "2026-12-03",
				kind: "co",
			}),
			"leave",
		).id,
	);

	const form = "session-report";
	ok(
		await owner("PUT", `/builder/forms/${form}`, {
			name: { ro: "Raport de ședință", en: "Session report" },
			body: { kind: "session_report", fields: ["summary"] },
		}),
		"form",
	);
	const record = str(
		ok(
			await owner("POST", `/clients/${c1}/records`, {
				formId: form,
				data: { summary: "synthetic-session-summary" },
			}),
			"record",
		).id,
	);
	const file = FileInitResult.parse(
		ok(
			await owner("POST", `/clients/${c1}/files`, {
				name: "report.pdf",
				contentType: "application/pdf",
				size: 1234,
			}),
			"file",
		),
	).file.id;
	ok(await owner("POST", `/files/${file}/complete`), "file complete");
	return {
		...world,
		ids: {
			dora,
			elena,
			mara,
			c1,
			c2,
			room,
			device,
			service,
			a1,
			a2,
			pkg,
			payment,
			group,
			leave,
			form,
			record,
			file,
			roles,
		},
	};
}

export async function createWorld(options: WorldOptions = {}): Promise<Populated> {
	return populate(await createBareWorld(options));
}
