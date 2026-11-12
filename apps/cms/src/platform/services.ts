import { type ControlClient, createControlClient, type Site, signWebhook } from "@psi/cms-client";
import {
	createSchedulingClient,
	createStaffSchedulingClient,
	readSchedulingEnv,
	type SchedulingClient,
	type StaffSchedulingClient,
} from "@psi/scheduling";
import { z } from "zod";
import { type Env, env } from "../env";

/**
 * Each section's own service, built from the environment once. A missing URL or key gives null:
 * the section shows "not configured". Nothing here reads another service's database: the sites
 * answer through their signed `/__control` routes, scheduling through its staff client (the CMS
 * calls scheduling, never the reverse).
 */
const CONTROL_URL: Readonly<Record<Site, (e: Env) => string | undefined>> = {
	psizone: (e) => e.PSIZONE_CONTROL_URL,
	eqsync: (e) => e.EQSYNC_CONTROL_URL,
	hemisync: (e) => e.HEMISYNC_CONTROL_URL,
	blog: (e) => e.BLOG_CONTROL_URL,
};

/** The brands that take bookings (a scheduling tenant each); the blog has none. */
export const SCHEDULING_TENANTS = ["psizone", "eqsync", "hemisync"] as const;
export type Tenant = (typeof SCHEDULING_TENANTS)[number];

/**
 * The scheduling tenant a brand's calendar lives in: the brand itself. For a trial run on a
 * developer's machine only, SCHEDULING_TENANT_OVERRIDES names another tenant instead; it is never
 * read in production.
 */
export function tenantOf(brand: Site): string | null {
	if (brand === "blog") return null;
	const override =
		process.env.NODE_ENV === "production" ? undefined : env().SCHEDULING_TENANT_OVERRIDES[brand];
	return override ?? brand;
}

const clients = new Map<Site, ControlClient | null>();

/** The site's control client, or null when its URL or the shared secret is not configured. */
export function controlFor(brand: Site): ControlClient | null {
	if (clients.has(brand)) return clients.get(brand) ?? null;
	const e = env();
	const origin = CONTROL_URL[brand](e);
	const client =
		origin === undefined || e.PSI_CONTROL_SECRET === undefined
			? null
			: createControlClient({ origin, secret: e.PSI_CONTROL_SECRET });
	clients.set(brand, client);
	return client;
}

let staff: StaffSchedulingClient | null | undefined;
let visitor: SchedulingClient | null | undefined;

/** The scheduling store's staff client, or null without CONVEX_URL and PSI_SCHEDULING_KEY. */
export function schedulingStaff(): StaffSchedulingClient | null {
	if (staff !== undefined) return staff;
	const e = env();
	const r = readSchedulingEnv({
		CONVEX_URL: e.CONVEX_URL,
		PSI_SCHEDULING_KEY: e.PSI_SCHEDULING_KEY,
	});
	staff = r.ok ? createStaffSchedulingClient(r.config) : null;
	return staff;
}

/**
 * The visitors' own client: what the sites and the guide call to find free times. The setup
 * page's preview goes through it, so it shows exactly what a visitor would be offered.
 */
export function schedulingVisitor(): SchedulingClient | null {
	if (visitor !== undefined) return visitor;
	const e = env();
	const r = readSchedulingEnv({
		CONVEX_URL: e.CONVEX_URL,
		PSI_SCHEDULING_KEY: e.PSI_SCHEDULING_KEY,
	});
	visitor = r.ok ? createSchedulingClient(r.config) : null;
	return visitor;
}

/** Mastra Studio for deep inspection: STUDIO_URL, else the live one or the local one. */
export function studioUrl(): string {
	return (
		env().STUDIO_URL ??
		(process.env.NODE_ENV === "production" ? "https://studio.psizone.ro" : "http://localhost:4360")
	);
}

export type BookingNotice =
	| { kind: "booking.confirmed"; reference: string; start: number; accountHash?: string }
	| { kind: "booking.cancelled"; reference: string; accountHash?: string };

const Report = z.object({ sent: z.number() }).passthrough();

/**
 * Tells the person, through the PWA hook on the brand's site (`/__pwa/notify`, HMAC-signed with
 * PWA_NOTIFY_SECRET), that staff confirmed or cancelled their request. The event names the
 * account's hash or the reference, never a time of day in words, a practitioner or a reason.
 */
export async function notifyBooking(
	brand: Site,
	event: BookingNotice,
): Promise<"sent" | "no_device" | "not_configured" | "failed"> {
	const e = env();
	const origin = CONTROL_URL[brand](e);
	if (origin === undefined || e.PWA_NOTIFY_SECRET === undefined) return "not_configured";
	const body = JSON.stringify({ event, sentAt: new Date().toISOString() });
	try {
		const r = await fetch(`${origin}/__pwa/notify`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-psi-signature": `sha256=${signWebhook(body, e.PWA_NOTIFY_SECRET)}`,
			},
			body,
			signal: AbortSignal.timeout(5000),
		});
		if (r.status === 503) return "not_configured";
		if (!r.ok) return "failed";
		const report = Report.safeParse(await r.json().catch(() => null));
		return report.success && report.data.sent > 0 ? "sent" : "no_device";
	} catch {
		return "failed";
	}
}
