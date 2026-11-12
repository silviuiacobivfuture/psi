import type { Endpoint, PayloadRequest } from "payload";
import { z } from "zod";
import { brandsFor } from "../authz/access";
import { BRANDS, type Brand } from "../authz/types";
import { actorOf } from "./access";
import { log } from "./http";
import { SECTIONS } from "./sections";
import { schedulingStaff, tenantOf } from "./services";

/**
 * What the Scheduling setup's JSON endpoints share: the field shapes, the answer (`{ ok: true, … }`
 * or `{ ok: false, error }` with an error key the page knows, never the store's own message), and
 * the manager action: parse the body, ask the estate for `calendar_manager` on its brand, call the
 * staff client as `cms:<user>`, log what was done. The reads check `calendar_viewer`.
 */
export const BrandName = z.enum(BRANDS);
export const Id = z.string().min(1).max(64);
export const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/);
export const Mode = z.enum(["onsite", "online"]);
export const Minutes = z.number().int().min(0).max(1440);
export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const Name = z.string().trim().min(1).max(80);

export type Fail = {
	ok: false;
	error: "invalid" | "notFound" | "exists" | "unreachable" | "notConfigured";
};
export type Done = { ok: true; note: string; target: string; [more: string]: unknown };
export type Actor = { subject: string };

export const fail = (error: Fail["error"], status: number): Response =>
	Response.json({ ok: false, error }, { status });

export async function jsonOf(req: PayloadRequest): Promise<unknown> {
	try {
		return JSON.parse(typeof req.text === "function" ? await req.text() : "");
	} catch {
		return null;
	}
}

/** One manager action: parse the body, check `calendar_manager` on its brand, run it, log it. */
export function action<S extends z.ZodType<{ brand: Brand }>>(
	path: string,
	schema: S,
	run: (
		input: z.infer<S>,
		ctx: { tenant: string; actor: Actor; staff: NonNullable<ReturnType<typeof schedulingStaff>> },
	) => Promise<Fail | Done>,
): Endpoint {
	return {
		path: `/platform/scheduling/setup/${path}`,
		method: "post",
		handler: async (req) => {
			const who = actorOf(req);
			if (who === null) return Response.json({ ok: false, error: "signIn" }, { status: 401 });
			const body = schema.safeParse(await jsonOf(req));
			if (!body.success) return fail("invalid", 400);
			if (!(await brandsFor(req, SECTIONS.scheduling.act)).includes(body.data.brand)) {
				return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
			}
			const tenant = tenantOf(body.data.brand);
			const staff = schedulingStaff();
			if (tenant === null || staff === null) return fail("notConfigured", 503);
			try {
				const out = await run(body.data, { tenant, actor: { subject: `cms:${who}` }, staff });
				if (!out.ok) return fail(out.error, out.error === "unreachable" ? 502 : 200);
				const { note, target, ...rest } = out;
				await log(req, { brand: body.data.brand, actor: who }, "schedule", target, note);
				return Response.json({ ...rest, ok: true });
			} catch {
				return fail("unreachable", 502);
			}
		},
	};
}

export const reasons = (r: "not_found" | "invalid" | "exists"): Fail =>
	({ ok: false, error: r === "not_found" ? "notFound" : r }) as const;
