import type { Endpoint, PayloadRequest } from "payload";
import { z } from "zod";
import { Decision, decideRequest } from "./decisions";
import { type Allowed, allow, back, bodyOf, log } from "./http";
import { SECTIONS } from "./sections";
import { schedulingStaff, tenantOf } from "./services";

/**
 * The Scheduling section's request decisions (the setup's actions are in
 * endpoints-scheduling-setup.ts), `calendar_manager` on the brand, through @psi/scheduling's staff
 * client (the CMS calls scheduling; scheduling never calls the CMS). A decision's reason is one of DECISION_REASONS, never free text. Confirm and decline tell the
 * person through the PWA hook when it is configured.
 */
const VIEW = "/admin/platform/scheduling";
const CallbackId = z.string().regex(/^[a-z0-9]{10,64}$/);

type Run = (
	a: Allowed,
	tenant: string,
	body: Record<string, string>,
) => Promise<{ done?: string; error?: string; note?: string }>;

function action(path: string, run: Run, tab = "requests"): Endpoint {
	return {
		path: `/platform/scheduling/${path}`,
		method: "post",
		handler: async (req: PayloadRequest) => {
			const body = await bodyOf(req);
			const a = await allow(req, SECTIONS.scheduling.act, body.brand);
			if (a instanceof Response) return a;
			const tenant = tenantOf(a.brand);
			if (tenant === null || schedulingStaff() === null)
				return back(VIEW, a.brand, { error: "notConfigured" });
			try {
				const out = await run(a, tenant, body);
				if (out.done !== undefined)
					await log(req, a, "decide", body.reference ?? body.id ?? "-", out.note ?? out.done);
				return back(VIEW, a.brand, out, `&tab=${tab}`);
			} catch {
				return back(VIEW, a.brand, { error: "unreachable" }, `&tab=${tab}`);
			}
		},
	};
}

const decide = action("decide", async (a, tenant, body) => {
	const d = Decision.safeParse(body);
	if (!d.success) return { error: "invalid" };
	return decideRequest(a.brand, a.actor, tenant, d.data);
});

/** The team called a callback request back: it leaves the list of what is still to do. */
const callbackHandled = action(
	"callback-handled",
	async (a, tenant, body) => {
		const id = CallbackId.safeParse(body.id);
		const staff = schedulingStaff();
		if (!id.success || staff === null) return { error: "invalid" };
		const r = await staff.markCallbackHandled({
			tenant,
			id: id.data,
			actor: { subject: `cms:${a.actor}` },
		});
		return r.ok ? { done: "done", note: "callback handled" } : { error: "notFound" };
	},
	"callbacks",
);

export const schedulingEndpoints: Endpoint[] = [decide, callbackHandled];
