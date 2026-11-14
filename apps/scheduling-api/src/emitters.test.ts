import { beforeEach, describe, expect, it } from "vitest";
import { sensitiveOf } from "./engagement/security";
import type { Notification } from "./ports/notify";
import { createWorld, type Populated } from "./testing/populate";
import { bookingContact, HOUR, NOW } from "./testing/world";

const A = "/v1/apps/psizone";
const DAY = 24 * HOUR;
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const as = (who: string, method: string, path: string, body?: unknown) =>
	w.call(who, method, `${A}${path}`, body);
const _sent = (event: string): Notification[] => w.notifier.sent.filter((n) => n.event === event);
/** What a call newly queued: the world's own set-up already queued some. */
async function newly(act: () => Promise<unknown>): Promise<Notification[]> {
	const before = w.notifier.sent.length;
	await act();
	return w.notifier.sent.slice(before);
}

describe("sensitive actions tell the owners", () => {
	it("names exactly the deletions, the role and member changes and the app's settings, and nothing else", () => {
		for (const [action, what] of [
			["client.delete", "delete"],
			["record.delete", "delete"],
			["file.delete", "delete"],
			["package.delete", "delete"],
			["payment.delete", "delete"],
			["role.create", "roles"],
			["role.update", "roles"],
			["role.permissions", "roles"],
			["role.delete", "roles"],
			["member.put", "members"],
			["member.remove", "members"],
			["member.overrides", "members"],
			["app.update", "settings"],
		] as const)
			expect(sensitiveOf(action), action).toBe(what);
		for (const action of [
			"appointment.create",
			"appointment.delete",
			"client.update",
			"client.archive",
			"file.download",
			"notifications.prefs",
			"client.invite",
			"clinical.read",
			"",
		])
			expect(sensitiveOf(action), action).toBeUndefined();
	});
	it("a role change is told at once, by whom and about what, to the people who read the audit log", async () => {
		const out = await newly(() =>
			as("olga", "PUT", `/roles/${w.ids.roles.volunteer}/permissions`, { permissions: [] }),
		);
		expect(out).toEqual([
			expect.objectContaining({
				event: "security.action",
				to: { kind: "team", permission: "audit_log_view" },
				payload: { action: "roles", actor: "olga", target: "roles" },
			}),
		]);
	});
	it("a deleted client and a changed member are told too; an ordinary booking is not", async () => {
		const made = await as("olga", "POST", "/clients", { name: "To Delete" });
		const deleted = await newly(() => as("olga", "DELETE", `/clients/${String(made.json.id)}`));
		expect(deleted.map((n) => n.payload.action)).toEqual(["delete"]);
		const member = await newly(() =>
			as("olga", "PUT", "/members/vera", {
				displayName: "vera test",
				roles: [w.ids.roles.volunteer],
				coordinates: [],
			}),
		);
		expect(
			member.filter((n) => n.event === "security.action").map((n) => n.payload.action),
		).toEqual(["members"]);
		const booking = await newly(() =>
			as("olga", "POST", "/appointments", {
				practitionerId: w.ids.elena,
				start: NOW + 9 * DAY,
				end: NOW + 9 * DAY + HOUR,
				kind: "block",
			}),
		);
		expect(booking.filter((n) => n.event === "security.action")).toEqual([]);
	});
	it("a refused change tells nobody, and a notifier that is down never fails the change", async () => {
		const refused = await newly(() =>
			as("dora", "PUT", `/roles/${w.ids.roles.volunteer}/permissions`, { permissions: [] }),
		);
		expect(refused).toEqual([]);
		w.notifier.failing = true;
		const r = await as("olga", "PUT", `/roles/${w.ids.roles.volunteer}/permissions`, {
			permissions: [],
		});
		expect(r.status).toBe(200);
		expect(w.logs.some((l) => l.event === "notify_failed")).toBe(true);
	});
});

describe("a low rating tells the owners", () => {
	let n = 0;
	async function rated(rating: number): Promise<Notification[]> {
		n += 1;
		const start = NOW - (10 + n) * DAY;
		const visit = await as("olga", "POST", "/appointments", {
			practitionerId: w.ids.elena,
			clientId: w.ids.c2,
			start,
			end: start + HOUR,
		});
		const link = await as("olga", "POST", "/feedback/links", { visit: String(visit.json.id) });
		return newly(async () => {
			const r = await w.callKey("psizone-web", "POST", `${A}/feedback/by-link`, {
				token: String(link.json.token),
				rating,
				text: "synthetic",
				consentContact: false,
			});
			expect(r.status).toBe(200);
		});
	}
	it.each([1, 2])("a rating of %i is told, by id and rating only", async (rating) => {
		const out = await rated(rating);
		expect(out).toEqual([
			expect.objectContaining({
				event: "feedback.negative",
				to: { kind: "team", permission: "feedback_view" },
				payload: { feedbackId: expect.any(String), rating },
			}),
		]);
		expect(JSON.stringify(out)).not.toContain("synthetic");
	});
	it.each([3, 4, 5])("a rating of %i is not", async (rating) => {
		expect(await rated(rating)).toEqual([]);
	});
	it("a submission with no rating is refused, and tells nobody", async () => {
		n += 1;
		const start = NOW - (10 + n) * DAY;
		const visit = await as("olga", "POST", "/appointments", {
			practitionerId: w.ids.elena,
			clientId: w.ids.c2,
			start,
			end: start + HOUR,
		});
		const link = await as("olga", "POST", "/feedback/links", { visit: String(visit.json.id) });
		const out = await newly(async () => {
			const r = await w.callKey("psizone-web", "POST", `${A}/feedback/by-link`, {
				token: String(link.json.token),
				text: "synthetic",
				consentContact: false,
			});
			expect(r.status).toBe(400);
		});
		expect(out).toEqual([]);
	});
});

describe("a therapist is told of a client they are given, and of a day that changes", () => {
	it("assigning adds only those who are new, once, and removing tells no one", async () => {
		const added = await newly(() =>
			as("olga", "PUT", `/clients/${w.ids.c1}/treating`, {
				treating: [w.ids.dora, w.ids.elena],
				reason: "synthetic reason",
			}),
		);
		expect(added.filter((x) => x.event === "client.assigned")).toEqual([
			expect.objectContaining({
				payload: expect.objectContaining({
					clientId: w.ids.c1,
					personId: w.ids.elena,
					actor: "olga",
				}),
			}),
		]);
		const same = await newly(() =>
			as("olga", "PUT", `/clients/${w.ids.c1}/treating`, {
				treating: [w.ids.dora, w.ids.elena],
				reason: "synthetic reason",
			}),
		);
		expect(same.filter((x) => x.event === "client.assigned")).toEqual([]);
		const removed = await newly(() =>
			as("olga", "PUT", `/clients/${w.ids.c1}/treating`, {
				treating: [w.ids.dora],
				reason: "synthetic reason",
			}),
		);
		expect(removed.filter((x) => x.event === "client.assigned")).toEqual([]);
	});
	it("a new client created with therapists tells each of them", async () => {
		const out = await newly(() =>
			as("olga", "POST", "/clients", {
				name: "New With Two",
				treating: [w.ids.dora, w.ids.elena],
			}),
		);
		expect(
			out
				.filter((x) => x.event === "client.assigned")
				.map((x) => x.payload.personId)
				.sort(),
		).toEqual([w.ids.dora, w.ids.elena].sort());
	});
	it("a roster day changes with the kind of change named, by whom", async () => {
		for (const [kind, what] of [
			["free", "day_off"],
			["work", "hours"],
			["leave_co", "leave"],
		] as const) {
			const out = await newly(() =>
				as(
					"olga",
					"PUT",
					`/roster/${w.ids.elena}/2026-12-0${kind === "free" ? 1 : kind === "work" ? 2 : 3}`,
					{
						kind,
						...(kind === "work" ? { start: 540, end: 1020 } : {}),
					},
				),
			);
			expect(out.filter((x) => x.event === "schedule.changed")).toEqual([
				expect.objectContaining({
					payload: expect.objectContaining({ personId: w.ids.elena, what, actor: "olga" }),
				}),
			]);
		}
	});
	it("a blocked time and an approved leave are told; a refused leave and a plain booking are not", async () => {
		const block = await newly(() =>
			as("olga", "POST", "/appointments", {
				practitionerId: w.ids.elena,
				kind: "block",
				start: NOW + 6 * DAY,
				end: NOW + 6 * DAY + HOUR,
			}),
		);
		expect(block.filter((x) => x.event === "schedule.changed")).toEqual([
			expect.objectContaining({ payload: expect.objectContaining({ what: "block" }) }),
		]);
		const approved = await newly(() =>
			as("olga", "POST", `/leave/${w.ids.leave}/decision`, { decision: "approved" }),
		);
		expect(approved.filter((x) => x.event === "schedule.changed")).toHaveLength(1);
		const request = await as("elena", "POST", "/leave", {
			personId: w.ids.elena,
			from: "2027-01-10",
			to: "2027-01-11",
			kind: "co",
		});
		const declined = await newly(() =>
			as("olga", "POST", `/leave/${String(request.json.id)}/decision`, { decision: "rejected" }),
		);
		expect(declined.filter((x) => x.event === "schedule.changed")).toEqual([]);
	});
});

describe("the desk is told when someone on the blacklist tries online", () => {
	const PHONE = "+40721555000";
	const flag = (severity = "block_online") =>
		as("olga", "POST", "/blacklist", {
			phone: PHONE,
			reason: "synthetic staff-only reason",
			category: "unpaid",
			severity,
		});
	it("the callback form: the entry, how hard and where, and nothing of the person or the reason", async () => {
		const entry = String((await flag()).json.id);
		const out = await newly(async () => {
			const r = await w.callKey("psizone-web", "POST", `${A}/book/callback-requests`, {
				contact: { name: "Blocked Person", phone: PHONE },
				locale: "ro",
			});
			expect(r.status).toBe(409);
		});
		expect(out).toEqual([
			expect.objectContaining({
				event: "blacklist.attempt",
				to: { kind: "team", permission: "blacklist_view" },
				payload: { entryId: entry, severity: "block_online", channel: "callback" },
			}),
		]);
		expect(JSON.stringify(out)).not.toMatch(/Blocked|555000|synthetic staff-only/);
	});
	it("a visitor who is not on it is not announced, and a blocked refusal still reads the same to the visitor", async () => {
		await flag();
		const out = await newly(async () => {
			const r = await w.callKey("psizone-web", "POST", `${A}/book/callback-requests`, {
				contact: { name: "Someone Else", phone: "+40721000999" },
				locale: "ro",
			});
			expect(r.status).toBe(200);
		});
		expect(out.filter((x) => x.event === "blacklist.attempt")).toEqual([]);
	});
	it("the booking form: told as coming from the website", async () => {
		await flag("block_all");
		const slots = await w.callKey(
			"psizone-web",
			"GET",
			`${A}/book/slots?service=evaluation&from=${NOW}&to=${NOW + 10 * DAY}&limit=3`,
		);
		const slot = (slots.json.slots as { practitioner: string; start: number }[])[0];
		if (slot === undefined) throw new Error("no slot");
		const hold = await w.callKey("psizone-web", "POST", `${A}/book/holds`, {
			service: "evaluation",
			practitioner: slot.practitioner,
			start: slot.start,
			mode: "onsite",
			locale: "ro",
			channel: "form",
		});
		const out = await newly(async () => {
			const r = await w.callKey(
				"psizone-web",
				"POST",
				`${A}/book/holds/${String(hold.json.reference)}/submit`,
				{
					holdToken: hold.json.holdToken,
					contact: bookingContact({ name: "Blocked Person", phone: PHONE }),
				},
			);
			expect(r.status).toBe(409);
		});
		expect(out.filter((x) => x.event === "blacklist.attempt")).toEqual([
			expect.objectContaining({
				payload: expect.objectContaining({ channel: "web", severity: "block_all" }),
			}),
		]);
	});
	it("a staff booking the blacklist stops is the person's own to read, never an alarm for the desk", async () => {
		const entry = await as("olga", "POST", "/blacklist", {
			client: w.ids.c1,
			reason: "synthetic",
			category: "other",
			severity: "block_online",
		});
		expect(entry.status).toBe(200);
		const out = await newly(async () => {
			const r = await as("rita", "POST", "/appointments", {
				practitionerId: w.ids.elena,
				clientId: w.ids.c1,
				start: NOW + 8 * DAY,
				end: NOW + 8 * DAY + HOUR,
			});
			expect(r.status).toBe(409);
		});
		expect(out.filter((x) => x.event === "blacklist.attempt")).toEqual([]);
	});
});
