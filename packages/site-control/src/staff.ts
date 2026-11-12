import { type Site, StaffAnswer, signControl } from "@psi/cms-client";

/**
 * Whether a signed-in person is staff, as the control plane decides it (the CMS asks the estate's
 * authorization: read on at least one brand). The site never decides it itself and keeps no role;
 * it remembers each answer for five minutes. No CMS, no secret, or any failure: not staff (the
 * link is hidden; `/admin` still works for anyone who types it).
 */
export const STAFF_PATH = "/api/platform/staff";
const TTL_MS = 5 * 60_000;

export interface StaffCheck {
	isStaff(subject: string, email: string | null): Promise<boolean>;
}

export function staffCheck(o: {
	cmsUrl: string | null;
	secret: string | null;
	brand: Site;
	now: () => number;
	fetch?: typeof fetch;
}): StaffCheck {
	const f = o.fetch ?? fetch;
	const known = new Map<string, { staff: boolean; at: number }>();
	return {
		async isStaff(subject, email) {
			if (o.cmsUrl === null || o.secret === null) return false;
			const hit = known.get(subject);
			if (hit !== undefined && o.now() - hit.at < TTL_MS) return hit.staff;
			let staff = false;
			try {
				const signed = signControl({
					method: "POST",
					path: STAFF_PATH,
					actor: `site:${o.brand}`,
					secret: o.secret,
					body: JSON.stringify({ subject, email }),
					now: o.now,
				});
				const r = await f(`${o.cmsUrl}${STAFF_PATH}`, {
					method: "POST",
					headers: { ...signed.headers, "content-type": "application/json" },
					body: signed.body,
					signal: AbortSignal.timeout(2000),
				});
				const a = StaffAnswer.safeParse(r.ok ? await r.json() : null);
				staff = a.success && a.data.staff;
			} catch {
				staff = false;
			}
			known.set(subject, { staff, at: o.now() });
			return staff;
		},
	};
}
