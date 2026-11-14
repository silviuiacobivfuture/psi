import type { Populated } from "./testing/populate";
import { HOUR, NOW, type Reply } from "./testing/world";

/**
 * The happy paths of the routes added after the first table, one file per area so no file passes its size. The key set is
 * the type: `happy.test.ts` demands a case for every route of the contract that is neither a stream nor here.
 */
export type Case = (w: Populated) => Promise<Reply>;
const A = "/v1/apps/psizone";
export const olga = (w: Populated, method: string, path: string, body?: unknown): Promise<Reply> =>
	w.call("olga", method, `${A}${path}`, body);

/** A plan with one floor, edited from `revision`. */
export const planAt = (revision: number) => ({
	doc: {
		version: 1,
		revision,
		width: 300,
		height: 200,
		northDeg: 0,
		floors: [{ id: "f1", name: "Parter", shapes: [] }],
	},
});

/** A flag on a phone number of its own, so a case never meets another's entry. */
let flagged = 0;
const flag = async (w: Populated, over: Record<string, unknown> = {}): Promise<string> => {
	flagged += 1;
	const made = await olga(w, "POST", "/blacklist", {
		phone: `+4072000${String(1000 + flagged)}`,
		reason: "synthetic reason",
		category: "other",
		severity: "warn",
		...over,
	});
	return String(made.json.id);
};

/** A finished appointment of its own (days in the past), so a feedback link can be issued for it. */
let finished = 0;
const finishedVisit = async (w: Populated): Promise<string> => {
	finished += 1;
	const start = NOW - (10 + finished) * 24 * HOUR;
	const made = await olga(w, "POST", "/appointments", {
		practitionerId: w.ids.elena,
		clientId: w.ids.c2,
		start,
		end: start + HOUR,
	});
	return String(made.json.id);
};
const link = async (w: Populated): Promise<string> =>
	String((await olga(w, "POST", "/feedback/links", { visit: await finishedVisit(w) })).json.token);
const rated = async (w: Populated): Promise<string> => {
	const sent = await w.callKey("psizone-web", "POST", `${A}/feedback/by-link`, {
		token: await link(w),
		rating: 5,
		text: "synthetic praise",
		consentContact: true,
		contact: { name: "Parent Test", email: "parent@example.test" },
	});
	return String(sent.json.id);
};

export const EXTRA_HAPPY = {
	"files.rename": (w) => olga(w, "PATCH", `/files/${w.ids.file}`, { name: "renamed.pdf" }),
	"floorPlan.get": (w) => olga(w, "GET", "/floor-plan"),
	"floorPlan.put": (w) => olga(w, "PUT", "/floor-plan", planAt(0)),
	"blacklist.list": (w) => olga(w, "GET", "/blacklist"),
	"blacklist.create": (w) =>
		olga(w, "POST", "/blacklist", {
			phone: "+40721000001",
			reason: "synthetic reason",
			category: "no_show_repeated",
			severity: "warn",
		}),
	"blacklist.get": async (w) => olga(w, "GET", `/blacklist/${await flag(w)}`),
	"blacklist.update": async (w) =>
		olga(w, "PATCH", `/blacklist/${await flag(w)}`, { severity: "block_online" }),
	"blacklist.remove": async (w) => olga(w, "DELETE", `/blacklist/${await flag(w)}`),
	"blacklist.check": (w) => olga(w, "GET", "/blacklist/check?phone=%2B40721000001"),
	"blacklist.events": (w) => olga(w, "GET", "/blacklist/events"),
	"feedback.issueLink": async (w) =>
		olga(w, "POST", "/feedback/links", { visit: await finishedVisit(w) }),
	"feedback.linkInspect": async (w) =>
		w.callKey(
			"psizone-web",
			"GET",
			`${A}/feedback/by-link?token=${encodeURIComponent(await link(w))}`,
		),
	"feedback.linkSubmit": async (w) =>
		w.callKey("psizone-web", "POST", `${A}/feedback/by-link`, {
			token: await link(w),
			rating: 4,
			text: "synthetic note",
			consentContact: false,
		}),
	"feedback.list": (w) => olga(w, "GET", "/feedback"),
	"feedback.get": async (w) => olga(w, "GET", `/feedback/${await rated(w)}`),
	"feedback.reply": async (w) =>
		olga(w, "POST", `/feedback/${await rated(w)}/replies`, { text: "synthetic answer" }),
	"feedback.setStatus": async (w) =>
		olga(w, "POST", `/feedback/${await rated(w)}/status`, { event: "read" }),
} satisfies Record<string, Case>;
export type ExtraId = keyof typeof EXTRA_HAPPY;
