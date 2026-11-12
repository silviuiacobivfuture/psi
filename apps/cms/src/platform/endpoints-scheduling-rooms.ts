import { ROOM_KINDS } from "@psi/scheduling";
import type { Endpoint, PayloadRequest } from "payload";
import { z } from "zod";
import { brandsFor } from "../authz/access";
import type { Brand } from "../authz/types";
import { actorOf } from "./access";
import { Decision, decideRequest } from "./decisions";
import {
	action,
	BrandName,
	Day,
	fail,
	Id,
	Minutes,
	Mode,
	Name,
	reasons,
	Slug,
} from "./scheduling-action";
import { slugify } from "./scheduling-model";
import { loadSetup } from "./scheduling-setup";
import { SECTIONS } from "./sections";
import { schedulingStaff, schedulingVisitor, tenantOf } from "./services";

/**
 * Rooms, the calendar's actions, and the reads (state, calendar, preview). Reading needs
 * `calendar_viewer`; changes need `calendar_manager` (see scheduling-action.ts).
 */
const Audience = z.enum(["child", "teen", "adult"]);
const Tag = z.string().regex(/^[a-z0-9][a-z0-9-]{0,30}$/);

const RoomFields = {
	name: Name,
	kind: z.enum(ROOM_KINDS),
	capacity: z.number().int().min(1).max(50),
	suits: z.array(Audience).min(1).max(3),
	equipment: z.array(Tag).max(12),
};

const createRoom = action(
	"room/create",
	z.object({ brand: BrandName, ...RoomFields }),
	async ({ brand: _brand, ...room }, { tenant, actor, staff }) => {
		for (let n = 1; n <= 6; n += 1) {
			const base = slugify(room.name);
			const slug = n === 1 ? base : `${base.slice(0, 38)}-${n}`;
			const r = await staff.createRoom({ tenant, room: { ...room, slug }, actor });
			if (r.ok) return { ok: true, id: r.id, target: slug, note: `room added: ${slug}` };
			if (r.reason === "invalid") return reasons("invalid");
		}
		return reasons("exists");
	},
);

const updateRoom = action(
	"room/update",
	z.object({
		brand: BrandName,
		room: Id,
		patch: z
			.object({ ...RoomFields, active: z.boolean() })
			.partial()
			.strict(),
	}),
	async (b, { tenant, actor, staff }) => {
		const r = await staff.updateRoom({ tenant, room: b.room, patch: b.patch, actor });
		return r.ok
			? { ok: true, target: b.room, note: `room changed: ${Object.keys(b.patch).join(",")}` }
			: reasons(r.reason);
	},
);

const addClosure = action(
	"room/closure/add",
	z.object({
		brand: BrandName,
		room: Id,
		from: Day,
		to: Day,
		start: Minutes.optional(),
		end: Minutes.optional(),
	}),
	async (b, { tenant, actor, staff }) => {
		const r = await staff.addRoomClosure({
			tenant,
			room: b.room,
			from: b.from,
			to: b.to,
			...(b.start === undefined || b.end === undefined ? {} : { start: b.start, end: b.end }),
			actor,
		});
		return r.ok
			? { ok: true, added: r.added, target: b.room, note: `room closed ${b.from}..${b.to}` }
			: reasons(r.reason);
	},
);

const removeClosure = action(
	"room/closure/remove",
	z.object({ brand: BrandName, closure: Id }),
	async (b, { tenant, actor, staff }) => {
		const r = await staff.removeRoomClosure({ tenant, closure: b.closure, actor });
		return r.ok ? { ok: true, target: b.closure, note: "room closure removed" } : reasons(r.reason);
	},
);

const decideFromCalendar = action(
	"calendar/decide",
	Decision.extend({ brand: BrandName }),
	async (b, { tenant, actor }) => {
		const { brand, ...d } = b;
		const out = await decideRequest(brand, actor.subject.replace(/^cms:/, ""), tenant, d);
		return out.error === undefined
			? { ok: true, target: d.reference, note: out.note ?? d.decision, told: out.done ?? "done" }
			: reasons(out.error === "notFound" ? "not_found" : "invalid");
	},
);

const rescheduleFromCalendar = action(
	"calendar/reschedule",
	z.object({
		brand: BrandName,
		reference: z.string().min(4).max(32),
		start: z.number().int().positive(),
		mode: Mode,
	}),
	async (b, { tenant, actor, staff }) => {
		const r = await staff.reschedule({
			tenant,
			reference: b.reference,
			start: b.start,
			mode: b.mode,
			actor,
		});
		return r.ok
			? {
					ok: true,
					reference: r.reference,
					target: b.reference,
					note: `rescheduled to ${r.reference}`,
				}
			: reasons(r.reason === "not_found" ? "not_found" : "invalid");
	},
);

/** The brand a read is for, if the person may view Scheduling on it; otherwise the refusal. */
async function viewable(
	req: PayloadRequest,
): Promise<Response | { brand: Brand; tenant: string; url: URL }> {
	if (actorOf(req) === null) return Response.json({ ok: false, error: "signIn" }, { status: 401 });
	const url = new URL(req.url ?? "http://cms.invalid/");
	const brand = BrandName.safeParse(url.searchParams.get("brand"));
	if (!brand.success) return fail("invalid", 400);
	if (!(await brandsFor(req, SECTIONS.scheduling.view)).includes(brand.data)) {
		return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
	}
	const tenant = tenantOf(brand.data);
	return tenant === null ? fail("notConfigured", 503) : { brand: brand.data, tenant, url };
}

const state: Endpoint = {
	path: "/platform/scheduling/state",
	method: "get",
	handler: async (req) => {
		const v = await viewable(req);
		if (v instanceof Response) return v;
		const staff = schedulingStaff();
		if (staff === null) return fail("notConfigured", 503);
		try {
			return Response.json({ ok: true, setup: await loadSetup(staff, v.brand, v.tenant) });
		} catch {
			return fail("unreachable", 502);
		}
	},
};

const Days = z.coerce.number().int().min(1).max(14);
const board: Endpoint = {
	path: "/platform/scheduling/board",
	method: "get",
	handler: async (req) => {
		const v = await viewable(req);
		if (v instanceof Response) return v;
		const from = Day.safeParse(v.url.searchParams.get("from"));
		const days = Days.safeParse(v.url.searchParams.get("days") ?? "7");
		const staff = schedulingStaff();
		if (!from.success || !days.success) return fail("invalid", 400);
		if (staff === null) return fail("notConfigured", 503);
		try {
			const r = await staff.board({ tenant: v.tenant, fromDate: from.data, days: days.data });
			return Response.json(
				r.ok ? r : { ok: false, error: r.reason === "invalid" ? "invalid" : "notFound" },
			);
		} catch {
			return fail("unreachable", 502);
		}
	},
};

const PREVIEW_DAYS = 21;
const preview: Endpoint = {
	path: "/platform/scheduling/preview",
	method: "get",
	handler: async (req) => {
		const v = await viewable(req);
		if (v instanceof Response) return v;
		const service = Slug.safeParse(v.url.searchParams.get("service"));
		const visitor = schedulingVisitor();
		if (!service.success) return fail("invalid", 400);
		if (visitor === null) return fail("notConfigured", 503);
		try {
			const now = Date.now();
			const found = await visitor.findSlots({
				tenant: v.tenant,
				service: service.data,
				from: now,
				to: now + PREVIEW_DAYS * 86_400_000,
				limit: 60,
			});
			return Response.json(
				found.ok
					? {
							ok: true,
							timeZone: found.timeZone,
							slots: found.slots.map((s) => ({
								start: s.start,
								practitioner: s.practitionerName,
								modes: s.modes,
							})),
						}
					: { ok: true, timeZone: "Europe/Bucharest", slots: [] },
			);
		} catch {
			return fail("unreachable", 502);
		}
	},
};

export const schedulingRoomsEndpoints: Endpoint[] = [
	createRoom,
	updateRoom,
	addClosure,
	removeClosure,
	decideFromCalendar,
	rescheduleFromCalendar,
	state,
	board,
	preview,
];
