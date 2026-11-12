import { DECISION_REASONS } from "@psi/scheduling";
import type { Endpoint, PayloadRequest } from "payload";
import { z } from "zod";
import { minutesOf } from "../views/platform/time";
import { type Allowed, allow, back, bodyOf, log } from "./http";
import { SECTIONS } from "./sections";
import { notifyBooking, schedulingStaff, tenantOf } from "./services";

/**
 * The Scheduling section's actions, all `calendar_manager` on the brand, all through
 * @psi/scheduling's staff client (the CMS calls scheduling; scheduling never calls the CMS). A
 * decision's reason is one of DECISION_REASONS, never free text. Confirm and decline tell the
 * person through the PWA hook when it is configured.
 */
const VIEW = "/admin/platform/scheduling";

type Run = (
	a: Allowed,
	tenant: "psizone" | "eqsync" | "hemisync",
	body: Record<string, string>,
) => Promise<{ done?: string; error?: string; note?: string }>;

function action(path: string, tab: "requests" | "setup", run: Run): Endpoint {
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
					await log(
						req,
						a,
						path === "decide" ? "decide" : "schedule",
						body.reference ??
							body.service ??
							body.practitioner ??
							body.rule ??
							body.exception ??
							"-",
						out.note ?? out.done,
					);
				return back(VIEW, a.brand, out, `&tab=${tab}`);
			} catch {
				return back(VIEW, a.brand, { error: "unreachable" }, `&tab=${tab}`);
			}
		},
	};
}

const staff = () => {
	const s = schedulingStaff();
	if (s === null) throw new Error("scheduling not configured");
	return s;
};

const Decision = z.object({
	reference: z.string().min(4).max(32),
	decision: z.enum(["confirm", "decline", "cancel"]),
	reason: z.enum(DECISION_REASONS).optional(),
});

const decide = action("decide", "requests", async (a, tenant, body) => {
	const d = Decision.safeParse(body);
	if (!d.success) return { error: "invalid" };
	const r = await staff().decide({
		tenant,
		reference: d.data.reference,
		decision: d.data.decision,
		...(d.data.decision === "confirm" || d.data.reason === undefined
			? {}
			: { reason: d.data.reason }),
		actor: { subject: `cms:${a.actor}` },
	});
	if (!r.ok) return { error: r.reason === "not_found" ? "notFound" : "invalid" };
	const who = r.accountHash === undefined ? {} : { accountHash: r.accountHash };
	const told = await notifyBooking(
		a.brand,
		d.data.decision === "confirm"
			? { kind: "booking.confirmed", reference: r.reference, start: r.start, ...who }
			: { kind: "booking.cancelled", reference: r.reference, ...who },
	);
	return {
		done: told === "sent" ? "notified" : told === "no_device" ? "notNotified" : "done",
		// The log keeps what was decided and why (an administrative code), and whether the person was told.
		note: `${d.data.decision}${d.data.decision === "confirm" || d.data.reason === undefined ? "" : `: ${d.data.reason}`} (push: ${told})`,
	};
});

const Num = z.coerce.number().int().min(0).max(100_000);
const ServiceForm = z.object({
	service: z.string().min(1).max(64),
	durationMinutes: Num,
	bufferMinutes: Num,
	minNoticeMinutes: Num,
	horizonDays: Num,
	active: z.enum(["on", "off"]),
});

const service = action("service", "setup", async (a, tenant, body) => {
	const f = ServiceForm.safeParse(body);
	if (!f.success) return { error: "invalid" };
	const { service: slug, active, ...rest } = f.data;
	const r = await staff().updateService({
		tenant,
		service: slug,
		patch: { ...rest, active: active === "on" },
		actor: { subject: `cms:${a.actor}` },
	});
	return r.ok ? { done: "done" } : { error: r.reason === "not_found" ? "notFound" : "invalid" };
});

const RuleForm = z.object({
	practitioner: z.string().min(1).max(64),
	weekday: z.coerce.number().int().min(1).max(7),
	start: z.string(),
	end: z.string(),
	mode: z.enum(["onsite", "online"]),
});

const addRule = action("rule/add", "setup", async (a, tenant, body) => {
	const f = RuleForm.safeParse(body);
	const start = minutesOf(body.start);
	const end = minutesOf(body.end);
	if (!f.success || start === null || end === null) return { error: "invalid" };
	const r = await staff().addRule({
		tenant,
		practitioner: f.data.practitioner,
		weekday: f.data.weekday,
		start,
		end,
		modes: [f.data.mode],
		actor: { subject: `cms:${a.actor}` },
	});
	return r.ok ? { done: "done" } : { error: r.reason === "not_found" ? "notFound" : "invalid" };
});

const Id = z.string().min(1).max(64);

const removeRule = action("rule/remove", "setup", async (a, tenant, body) => {
	const id = Id.safeParse(body.rule);
	if (!id.success) return { error: "invalid" };
	const r = await staff().removeRule({
		tenant,
		rule: id.data,
		actor: { subject: `cms:${a.actor}` },
	});
	return r.ok ? { done: "done" } : { error: "notFound" };
});

const ExceptionForm = z.object({
	practitioner: Id,
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	kind: z.enum(["closed", "open"]),
});

const addException = action("exception/add", "setup", async (a, tenant, body) => {
	const f = ExceptionForm.safeParse(body);
	if (!f.success) return { error: "invalid" };
	const start = minutesOf(body.start);
	const end = minutesOf(body.end);
	if ((start === null) !== (end === null) || (f.data.kind === "open" && start === null))
		return { error: "invalid" };
	const r = await staff().addException({
		tenant,
		practitioner: f.data.practitioner,
		date: f.data.date,
		kind: f.data.kind,
		...(start === null || end === null ? {} : { start, end }),
		actor: { subject: `cms:${a.actor}` },
	});
	return r.ok ? { done: "done" } : { error: "invalid" };
});

const removeException = action("exception/remove", "setup", async (a, tenant, body) => {
	const id = Id.safeParse(body.exception);
	if (!id.success) return { error: "invalid" };
	const r = await staff().removeException({
		tenant,
		exception: id.data,
		actor: { subject: `cms:${a.actor}` },
	});
	return r.ok ? { done: "done" } : { error: "notFound" };
});

export const schedulingEndpoints: Endpoint[] = [
	decide,
	service,
	addRule,
	removeRule,
	addException,
	removeException,
];
