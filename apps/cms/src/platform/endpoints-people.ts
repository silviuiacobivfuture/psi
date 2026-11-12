import { StaffQuery, verifyControl } from "@psi/cms-client";
import type { Endpoint, PayloadRequest } from "payload";
import { z } from "zod";
import { authorizer } from "../authz/index";
import { env } from "../env";
import { directorySubject } from "./access";
import { allow, back, bodyOf, log } from "./http";
import { SECTIONS } from "./sections";
import { controlFor } from "./services";

/**
 * Accounts (privacy officer), notifications (notifications admin), and the sites' staff question.
 * Accounts are estate-wide and the reservations live on Psizone, so export and erasure always go
 * through Psizone's site and need `privacy_officer` on psizone; the search and the person view use
 * the chosen brand's site. Every view and action is appended to the editorial log with the
 * account's subject, never its e-mail.
 */
const ACCOUNTS = "/admin/platform/accounts";
const NOTIFY = "/admin/platform/notifications";
const Subject = z.string().min(1).max(200);

const search: Endpoint = {
	path: "/platform/accounts/search",
	method: "post",
	handler: async (req) => {
		const body = await bodyOf(req);
		const a = await allow(req, SECTIONS.accounts.act, body.brand);
		if (a instanceof Response) return a;
		const email = z.string().trim().email().max(320).safeParse(body.email);
		if (!email.success) return back(ACCOUNTS, a.brand, { error: "invalid" });
		const control = controlFor(a.brand);
		if (control === null) return back(ACCOUNTS, a.brand, { error: "notConfigured" });
		const r = await control.searchAccounts(email.data, a.actor);
		if (!r.ok)
			return back(ACCOUNTS, a.brand, {
				error: r.problem === "not_configured" ? "notConfigured" : "unreachable",
			});
		if (r.data.length === 0) return back(ACCOUNTS, a.brand, { error: "accNone" });
		// Opaque subjects in the URL, never the e-mail.
		return back(
			ACCOUNTS,
			a.brand,
			{},
			`&hits=${r.data.map((h) => encodeURIComponent(h.subject)).join(",")}`,
		);
	},
};

const exportAccount: Endpoint = {
	path: "/platform/accounts/export",
	method: "post",
	handler: async (req) => {
		const body = await bodyOf(req);
		const a = await allow(req, SECTIONS.accounts.act, "psizone");
		if (a instanceof Response) return a;
		const subject = Subject.safeParse(body.subject);
		const control = controlFor("psizone");
		if (!subject.success || control === null)
			return back(ACCOUNTS, a.brand, { error: "notConfigured" });
		const r = await control.exportAccount(subject.data, a.actor);
		if (!r.ok)
			return back(ACCOUNTS, a.brand, {
				error: r.problem === "not_found" ? "notFound" : "unreachable",
			});
		await log(req, a, "account_export", subject.data);
		return new Response(JSON.stringify(r.data, null, 2), {
			headers: {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "private, no-store",
				"content-disposition": `attachment; filename="psi-account-${new Date().toISOString().slice(0, 10)}.json"`,
			},
		});
	},
};

const erase: Endpoint = {
	path: "/platform/accounts/erase",
	method: "post",
	handler: async (req) => {
		const body = await bodyOf(req);
		const a = await allow(req, SECTIONS.accounts.act, "psizone");
		if (a instanceof Response) return a;
		const subject = Subject.safeParse(body.subject);
		if (!subject.success) return back(ACCOUNTS, a.brand, { error: "invalid" });
		if ((body.confirm ?? "").trim().toLocaleUpperCase("ro") !== "ȘTERGE") {
			return back(
				ACCOUNTS,
				a.brand,
				{ error: "eraseMismatch" },
				`&hits=${encodeURIComponent(subject.data)}`,
			);
		}
		const control = controlFor("psizone");
		if (control === null) return back(ACCOUNTS, a.brand, { error: "notConfigured" });
		const r = await control.erase(subject.data, a.actor);
		if (!r.ok || !r.data.ok)
			return back(ACCOUNTS, a.brand, { error: r.ok ? "notFound" : "unreachable" });
		await log(req, a, "account_erase", subject.data, `${r.data.sessionsEnded} sessions ended`);
		return back(ACCOUNTS, a.brand, { done: "erased" });
	},
};

const pushTest: Endpoint = {
	path: "/platform/notifications/test",
	method: "post",
	handler: async (req) => {
		const body = await bodyOf(req);
		const a = await allow(req, SECTIONS.notifications.act, body.brand);
		if (a instanceof Response) return a;
		// Only ever the asking staff member's own account: their directory subject.
		const subject = directorySubject(req);
		if (subject === null) return back(NOTIFY, a.brand, { error: "noDirectory" });
		const control = controlFor(a.brand);
		if (control === null) return back(NOTIFY, a.brand, { error: "notConfigured" });
		const r = await control.pushTest(subject, a.actor);
		if (!r.ok)
			return back(NOTIFY, a.brand, {
				error: r.problem === "not_configured" ? "notConfigured" : "unreachable",
			});
		await log(req, a, "push_test", subject, `${r.data.sent}/${r.data.recipients}`);
		return back(
			NOTIFY,
			a.brand,
			r.data.sent > 0
				? { done: "testPushSent" }
				: { error: r.data.recipients > 0 ? "testPushFailed" : "testPushNone" },
		);
	},
};

const UserRow = z.object({
	docs: z.array(
		z.object({
			id: z.union([z.number(), z.string()]),
			email: z.string(),
			sub: z.string().nullish(),
			directoryGroups: z.array(z.string()).nullish(),
		}),
	),
});

/**
 * POST /api/platform/staff — a site asks whether one signed-in person is staff (read on any
 * brand), to show the Compass's Administrare link. Signed by the site (PSI_CONTROL_SECRET); the
 * answer is a yes or no, nothing else. The person's CMS row (groups mirrored at their last CMS
 * sign-in) is used when there is one.
 */
const staff: Endpoint = {
	path: "/platform/staff",
	method: "post",
	handler: async (req: PayloadRequest) => {
		const url = new URL(req.url ?? "http://cms.invalid/api/platform/staff");
		const text = typeof req.text === "function" ? await req.text() : "";
		const headers = new Headers(req.headers);
		const v = await verifyControl(
			new Request(url, { method: "POST", headers, body: text }),
			env().PSI_CONTROL_SECRET,
		);
		if (!v.ok) return new Response(null, { status: v.status });
		let parsed: unknown = null;
		try {
			parsed = JSON.parse(v.body);
		} catch {
			parsed = null;
		}
		const q = StaffQuery.safeParse(parsed);
		if (!q.success) return Response.json({ error: "invalid" }, { status: 400 });
		const rows = UserRow.parse(
			await req.payload.find({
				collection: "users",
				where: {
					or: [
						{ sub: { equals: q.data.subject } },
						...(q.data.email === null ? [] : [{ email: { equals: q.data.email } }]),
					],
				},
				limit: 1,
				depth: 0,
				overrideAccess: true,
				req,
			}),
		);
		const row = rows.docs[0];
		const brands = await authorizer().brands(
			{
				userId: row === undefined ? "" : String(row.id),
				sub: q.data.subject,
				email: row?.email ?? q.data.email ?? "",
				groups: row?.directoryGroups ?? [],
			},
			"read",
		);
		return Response.json(
			{ staff: brands.length > 0 },
			{ headers: { "cache-control": "no-store" } },
		);
	},
};

export const peopleEndpoints: Endpoint[] = [search, exportAccount, erase, pushTest, staff];
