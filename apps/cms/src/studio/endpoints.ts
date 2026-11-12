import { PREVIEW_HISTORY_TURNS, type Site, TestQuestion } from "@psi/cms-client";
import type { Endpoint, PayloadRequest } from "payload";
import { z } from "zod";
import { brandsFor } from "../authz/access";
import { BRANDS } from "../authz/types";
import { allow } from "../platform/http";
import { controlFor } from "../platform/services";
import {
	discardDraft,
	readDraft,
	readVersion,
	STUDIO_NOTE,
	saveDraft,
	type VersionNote,
} from "./history";
import { StudioSettings, studioSettingsOf } from "./settings";

/**
 * The AI behaviour studio's actions, JSON in and out (the page calls them with fetch):
 * - POST /api/platform/ai/behaviour/draft    save the draft            (`ai_admin`)
 * - POST /api/platform/ai/behaviour/discard  drop the draft            (`ai_admin`)
 * - POST /api/platform/ai/behaviour/publish  make settings live        (`ai_admin`)
 * - POST /api/platform/ai/behaviour/revert   make a past version live  (`ai_admin`)
 * - POST /api/platform/ai/behaviour/preview  one answer from the brand's real guide, streamed as
 *   NDJSON, with the draft (`ai_operator`; the unsaved settings the page sends are honoured only
 *   for `ai_admin`, everyone else previews the saved draft, else the live settings). Never
 *   counted, never stored.
 * Publishing goes through the global with the person's own access, so its hooks stamp, record
 * the version and notify the site (which re-reads its settings at once).
 */
const Brand = z.enum(BRANDS);
const Draft = z.object({ brand: Brand, settings: StudioSettings });
const BrandOnly = z.object({ brand: Brand });
const Revert = z.object({ brand: Brand, version: z.string().min(1).max(40) });
const Preview = z.object({
	brand: Brand,
	locale: z.enum(["ro", "en"]),
	question: TestQuestion.shape.question,
	history: TestQuestion.shape.history.unwrap().max(PREVIEW_HISTORY_TURNS).optional(),
	/** The page's unsaved settings; honoured for `ai_admin` only. */
	settings: StudioSettings.optional(),
});

async function body(req: PayloadRequest): Promise<unknown> {
	try {
		return JSON.parse(typeof req.text === "function" ? await req.text() : "");
	} catch {
		return null;
	}
}

const bad = (issues: z.ZodError): Response =>
	Response.json(
		{ error: "invalid", issues: issues.issues.slice(0, 5).map((i) => i.path.join(".")) },
		{ status: 400 },
	);

/** Makes `settings` the brand's live settings, through the global and the person's own access. */
async function publish(
	req: PayloadRequest,
	brand: Site,
	settings: StudioSettings,
	note: VersionNote,
): Promise<Response> {
	req.context[STUDIO_NOTE] = note;
	try {
		await req.payload.updateGlobal({
			slug: "ai-settings",
			data: { [brand]: settings },
			depth: 0,
			overrideAccess: false,
			user: req.user,
			req,
		});
	} catch {
		return Response.json({ error: "refused" }, { status: 403 });
	}
	await discardDraft(req, brand);
	const live = studioSettingsOf(
		await req.payload.findGlobal({ slug: "ai-settings", depth: 0, overrideAccess: true, req }),
		brand,
	);
	return Response.json({ ok: true, live });
}

const draft: Endpoint = {
	path: "/platform/ai/behaviour/draft",
	method: "post",
	handler: async (req) => {
		const p = Draft.safeParse(await body(req));
		if (!p.success) return bad(p.error);
		const a = await allow(req, "ai_admin", p.data.brand);
		if (a instanceof Response) return a;
		const saved = await saveDraft(req, a.brand, p.data.settings);
		return Response.json({ ok: true, draft: { at: saved.at, by: saved.by } });
	},
};

const discard: Endpoint = {
	path: "/platform/ai/behaviour/discard",
	method: "post",
	handler: async (req) => {
		const p = BrandOnly.safeParse(await body(req));
		if (!p.success) return bad(p.error);
		const a = await allow(req, "ai_admin", p.data.brand);
		if (a instanceof Response) return a;
		await discardDraft(req, a.brand);
		return Response.json({ ok: true });
	},
};

const publishEndpoint: Endpoint = {
	path: "/platform/ai/behaviour/publish",
	method: "post",
	handler: async (req) => {
		const p = Draft.safeParse(await body(req));
		if (!p.success) return bad(p.error);
		const a = await allow(req, "ai_admin", p.data.brand);
		if (a instanceof Response) return a;
		return publish(req, a.brand, p.data.settings, "studio");
	},
};

const revert: Endpoint = {
	path: "/platform/ai/behaviour/revert",
	method: "post",
	handler: async (req) => {
		const p = Revert.safeParse(await body(req));
		if (!p.success) return bad(p.error);
		const a = await allow(req, "ai_admin", p.data.brand);
		if (a instanceof Response) return a;
		const v = await readVersion(req, a.brand, p.data.version);
		if (v === null) return Response.json({ error: "not_found" }, { status: 404 });
		return publish(req, a.brand, v.settings, "revert");
	},
};

/** What the preview answers with: the page's settings (an admin), the saved draft, or live. */
async function previewSettings(
	req: PayloadRequest,
	brand: Site,
	sent: StudioSettings | undefined,
): Promise<StudioSettings | null> {
	if (sent !== undefined && (await brandsFor(req, "ai_admin")).includes(brand)) return sent;
	return (await readDraft(req, brand))?.settings ?? null;
}

const preview: Endpoint = {
	path: "/platform/ai/behaviour/preview",
	method: "post",
	handler: async (req) => {
		const p = Preview.safeParse(await body(req));
		if (!p.success) return bad(p.error);
		const a = await allow(req, "ai_operator", p.data.brand);
		if (a instanceof Response) return a;
		const control = controlFor(a.brand);
		if (control === null) return Response.json({ error: "not_configured" }, { status: 501 });
		const settings = await previewSettings(req, a.brand, p.data.settings);
		const r = await control.ask(
			{
				question: p.data.question,
				locale: p.data.locale,
				...(p.data.history === undefined ? {} : { history: p.data.history }),
				...(settings === null ? {} : { draft: settings }),
			},
			a.actor,
		);
		if (!r.ok) return Response.json({ error: r.problem }, { status: 502 });
		const encoder = new TextEncoder();
		const lines = r.data;
		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				try {
					for await (const line of lines) {
						controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
					}
				} catch {
					controller.enqueue(
						encoder.encode(`${JSON.stringify({ type: "refusal", reason: "error" })}\n`),
					);
				}
				controller.close();
			},
		});
		return new Response(stream, {
			headers: {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-store",
			},
		});
	},
};

export const studioEndpoints: Endpoint[] = [draft, discard, publishEndpoint, revert, preview];
