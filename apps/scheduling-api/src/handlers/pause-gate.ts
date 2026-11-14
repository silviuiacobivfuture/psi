import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import {
	type LoadedPause,
	loadPauses,
	noticeOf,
	type PauseQuestion,
	pausesFor,
} from "../engagement/booking-pause";
import type { Ctx } from "../http/context";
import { type ApiError, fail } from "../http/errors";

type C = Ctx<RouteSpec>;

/** The 409 a paused booking answers: the visitor's message and whether a callback stays open, in `detail`. */
export function pausedError(p: LoadedPause): ApiError {
	return fail("booking_paused", "online booking is paused", noticeOf(p));
}

/** The public site a visitor route was called from: the service key's caller (`psizone-web`), none for a person. */
export function siteOf(ctx: C): string | undefined {
	return ctx.principal.kind === "service" ? ctx.principal.callerId : undefined;
}

/** What a visitor route reads to decide: the app's pauses, the site, and how a practitioner's pause names them. */
export interface VisitorPauses {
	pauses: LoadedPause[];
	site: string | undefined;
	/** The people id of a practitioner the visitor flow names, when a pause of their own names them. */
	personOf(visitorId: string): string | undefined;
}

export async function visitorPauses(ctx: C): Promise<VisitorPauses> {
	const pauses = await loadPauses(ctx.deps.store, ctx.app);
	const byKey = new Map<string, string>();
	for (const p of pauses) {
		if (p.scope.level !== "practitioner") continue;
		const key = ctx.deps.store.visitor.practitionerKey(p.scope.practitionerId);
		if (key !== undefined) byKey.set(key, p.scope.practitionerId);
	}
	return { pauses, site: siteOf(ctx), personOf: (visitorId) => byKey.get(visitorId) };
}

/** The widest pause in force that covers a visitor's booking, if any. */
export function visitorPause(
	vp: VisitorPauses,
	now: number,
	q: { service?: string | undefined; practitioner?: string | undefined },
): LoadedPause | undefined {
	const practitioner = q.practitioner === undefined ? undefined : vp.personOf(q.practitioner);
	return pausesFor(vp.pauses, now, {
		site: vp.site,
		service: q.service,
		...(practitioner === undefined ? {} : { practitioner }),
	})[0];
}

/** Refuses a visitor's booking (free times, a hold, a submit, a move) while a pause covers it; nothing is written. */
export async function refuseWhilePaused(
	ctx: C,
	q: { service?: string | undefined; practitioner?: string | undefined },
): Promise<VisitorPauses> {
	const vp = await visitorPauses(ctx);
	const hit = visitorPause(vp, ctx.now, q);
	if (hit !== undefined) throw pausedError(hit);
	return vp;
}

/** Refuses a callback request only while a pause that covers it keeps callbacks closed too. */
export async function refuseClosedCallbacks(ctx: C, service: string | undefined): Promise<void> {
	const vp = await visitorPauses(ctx);
	const closed = pausesFor(vp.pauses, ctx.now, { site: vp.site, service }).find(
		(p) => !p.callbacksOpen,
	);
	if (closed !== undefined) throw pausedError(closed);
}

/**
 * Refuses a staff booking or move while a pause that blocks staff too covers it (the organisation, the service, the
 * practitioner); a pause that leaves staff free never stops the console. Asked before anything is written.
 */
export async function refuseStaffWhilePaused(
	ctx: C,
	at: { practitionerId?: string | undefined; serviceId?: string | undefined },
): Promise<void> {
	const pauses = await loadPauses(ctx.deps.store, ctx.app);
	if (!pauses.some((p) => p.blockStaff)) return;
	const service =
		at.serviceId === undefined
			? undefined
			: (await ctx.deps.store.c.services.get(ctx.app, at.serviceId))?.slug;
	const q: PauseQuestion = { staff: true, service, practitioner: at.practitionerId };
	const hit = pausesFor(pauses, ctx.now, q)[0];
	if (hit !== undefined) throw pausedError(hit);
}
