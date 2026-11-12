import { ROOM_KINDS } from "@psi/scheduling";
import type { Endpoint, PayloadRequest } from "payload";
import { z } from "zod";
import { brandsFor } from "../authz/access";
import { BRANDS, type Brand } from "../authz/types";
import { actorOf } from "./access";
import { Decision, decideRequest } from "./decisions";
import { log } from "./http";
import { slugify } from "./scheduling-model";
import { loadSetup } from "./scheduling-setup";
import { SECTIONS } from "./sections";
import { schedulingStaff, schedulingVisitor, tenantOf } from "./services";

/**
 * The Scheduling setup page's actions, JSON in and out (the page calls them with fetch). Reading
 * the setup and the visitors' preview needs `calendar_viewer` on the brand; every change needs
 * `calendar_manager` on it, asked again here each time (the page's own checks are only for show).
 * All of it goes through @psi/scheduling's staff client, recording the CMS user as the actor; the
 * CMS never writes scheduling's data any other way. Answers are `{ ok: true, … }` or
 * `{ ok: false, error }` with an error key the page knows (never the store's own message).
 *
 * - GET  /api/platform/scheduling/state?brand=            the whole setup
 * - GET  /api/platform/scheduling/preview?brand=&service= the next free times, as a visitor sees them
 * - POST /api/platform/scheduling/setup/<action>          see `ACTIONS`
 */
const BrandName = z.enum(BRANDS);
const Id = z.string().min(1).max(64);
const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/);
const Mode = z.enum(["onsite", "online"]);
const Minutes = z.number().int().min(0).max(1440);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Name = z.string().trim().min(1).max(80);

type Fail = {
	ok: false;
	error: "invalid" | "notFound" | "exists" | "unreachable" | "notConfigured";
};
type Done = { ok: true; note: string; target: string; [more: string]: unknown };
type Actor = { subject: string };

const fail = (error: Fail["error"], status: number): Response =>
	Response.json({ ok: false, error }, { status });

async function jsonOf(req: PayloadRequest): Promise<unknown> {
	try {
		return JSON.parse(typeof req.text === "function" ? await req.text() : "");
	} catch {
		return null;
	}
}

/** One manager action: parse the body, check `calendar_manager` on its brand, run it, log it. */
function action<S extends z.ZodType<{ brand: Brand }>>(
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

const reasons = (r: "not_found" | "invalid" | "exists"): Fail =>
	({ ok: false, error: r === "not_found" ? "notFound" : r }) as const;

const createPractitioner = action(
	"practitioner/create",
	z.object({ brand: BrandName, name: Name, external: z.boolean().optional() }),
	async ({ name, external }, { tenant, actor, staff }) => {
		const base = slugify(name);
		for (let n = 1; n <= 6; n += 1) {
			const slug = n === 1 ? base : `${base.slice(0, 38)}-${n}`;
			const r = await staff.createPractitioner({
				tenant,
				slug,
				displayName: name,
				...(external === true ? { external } : {}),
				actor,
			});
			if (r.ok) return { ok: true, id: r.id, target: slug, note: `practitioner added: ${slug}` };
			if (r.reason === "invalid") return reasons("invalid");
		}
		return reasons("exists");
	},
);

const updatePractitioner = action(
	"practitioner/update",
	z.object({
		brand: BrandName,
		practitioner: Id,
		name: Name.optional(),
		active: z.boolean().optional(),
		external: z.boolean().optional(),
		rooms: z.array(Id).max(50).optional(),
	}),
	async (b, { tenant, actor, staff }) => {
		const r = await staff.updatePractitioner({
			tenant,
			practitioner: b.practitioner,
			patch: {
				...(b.name === undefined ? {} : { displayName: b.name }),
				...(b.active === undefined ? {} : { active: b.active }),
				...(b.external === undefined ? {} : { external: b.external }),
				...(b.rooms === undefined ? {} : { rooms: b.rooms }),
			},
			actor,
		});
		return r.ok
			? {
					ok: true,
					upcoming: r.upcoming,
					target: b.practitioner,
					note: `practitioner ${b.active === undefined ? "renamed" : b.active ? "on" : "off"}`,
				}
			: reasons(r.reason);
	},
);

const ServiceFields = {
	nameRo: Name,
	nameEn: Name,
	durationMinutes: z.number().int().min(5).max(480),
	bufferMinutes: z.number().int().min(0).max(240),
	stepMinutes: z.number().int().min(5).max(240),
	minNoticeMinutes: z
		.number()
		.int()
		.min(0)
		.max(60 * 24 * 30),
	horizonDays: z.number().int().min(1).max(180),
	modes: z.array(Mode).min(1).max(2),
	practitioners: z.array(Id).max(50),
};

const Audience = z.enum(["child", "teen", "adult"]);
const Tag = z.string().regex(/^[a-z0-9][a-z0-9-]{0,30}$/);
const RoomNeed = {
	roomKind: z.enum(ROOM_KINDS).nullable(),
	roomEquipment: z.array(Tag).max(12),
	roomAudiences: z.array(Audience).max(3),
};

const createService = action(
	"service/create",
	z.object({
		brand: BrandName,
		slug: Slug,
		location: z.string().max(64).optional(),
		...ServiceFields,
		...RoomNeed,
	}),
	async (b, { tenant, actor, staff }) => {
		const r = await staff.createService({
			tenant,
			service: {
				slug: b.slug,
				name: { ro: b.nameRo, en: b.nameEn },
				durationMinutes: b.durationMinutes,
				bufferMinutes: b.bufferMinutes,
				stepMinutes: b.stepMinutes,
				minNoticeMinutes: b.minNoticeMinutes,
				horizonDays: b.horizonDays,
				holdMinutes: 10,
				modes: b.modes,
				practitioners: b.practitioners,
				...(b.location === undefined || b.location === "" ? {} : { location: b.location }),
				...(b.roomKind === null
					? {}
					: {
							roomKind: b.roomKind,
							roomEquipment: b.roomEquipment,
							roomAudiences: b.roomAudiences,
						}),
			},
			actor,
		});
		return r.ok
			? { ok: true, target: b.slug, note: `service added: ${b.slug}` }
			: reasons(r.reason);
	},
);

const updateService = action(
	"service/update",
	z.object({
		brand: BrandName,
		service: Slug,
		patch: z
			.object({
				nameRo: Name,
				nameEn: Name,
				durationMinutes: ServiceFields.durationMinutes,
				bufferMinutes: ServiceFields.bufferMinutes,
				stepMinutes: ServiceFields.stepMinutes,
				minNoticeMinutes: ServiceFields.minNoticeMinutes,
				horizonDays: ServiceFields.horizonDays,
				modes: ServiceFields.modes,
				practitioners: ServiceFields.practitioners,
				...RoomNeed,
				active: z.boolean(),
			})
			.partial()
			.strict(),
	}),
	async (b, { tenant, actor, staff }) => {
		const { nameRo, nameEn, ...rest } = b.patch;
		if ((nameRo === undefined) !== (nameEn === undefined)) return reasons("invalid");
		const r = await staff.updateService({
			tenant,
			service: b.service,
			patch: {
				...rest,
				...(nameRo === undefined || nameEn === undefined
					? {}
					: { name: { ro: nameRo, en: nameEn } }),
			},
			actor,
		});
		return r.ok
			? { ok: true, target: b.service, note: `service changed: ${Object.keys(b.patch).join(",")}` }
			: reasons(r.reason);
	},
);

const setDay = action(
	"hours/day",
	z.object({
		brand: BrandName,
		practitioner: Id,
		weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
		windows: z
			.array(z.object({ start: Minutes, end: Minutes, modes: z.array(Mode).min(1) }))
			.max(8),
		week: z.enum(["A", "B"]).optional(),
	}),
	async (b, { tenant, actor, staff }) => {
		const r = await staff.setDayRules({
			tenant,
			practitioner: b.practitioner,
			weekdays: b.weekdays,
			windows: b.windows,
			...(b.week === undefined ? {} : { week: b.week }),
			actor,
		});
		return r.ok
			? {
					ok: true,
					target: b.practitioner,
					note: `hours on ${b.weekdays.join(",")}: ${b.windows.length} window(s)`,
				}
			: reasons(r.reason);
	},
);

const removeRule = action(
	"hours/rule/remove",
	z.object({ brand: BrandName, rule: Id }),
	async (b, { tenant, actor, staff }) => {
		const r = await staff.removeRule({ tenant, rule: b.rule, actor });
		return r.ok ? { ok: true, target: b.rule, note: "dated opening removed" } : reasons(r.reason);
	},
);

const addDaysOff = action(
	"daysoff/add",
	z.object({
		brand: BrandName,
		/** Practitioner ids, or "all" for every practitioner who is on. */
		practitioners: z.union([z.literal("all"), z.array(Id).min(1).max(20)]),
		from: Day,
		to: Day,
	}),
	async (b, { tenant, actor, staff }) => {
		const ids =
			b.practitioners === "all"
				? await staff
						.catalog({ tenant })
						.then((c) => (c.ok ? c.practitioners.filter((p) => p.active).map((p) => p.id) : []))
				: b.practitioners;
		const r = await staff.addDaysOff({ tenant, practitioners: ids, from: b.from, to: b.to, actor });
		return r.ok
			? {
					ok: true,
					added: r.added,
					target: `${b.from}..${b.to}`,
					note: `days off: ${r.added} added`,
				}
			: reasons(r.reason);
	},
);

const removeDayOff = action(
	"daysoff/remove",
	z.object({ brand: BrandName, exception: Id }),
	async (b, { tenant, actor, staff }) => {
		const r = await staff.removeException({ tenant, exception: b.exception, actor });
		return r.ok ? { ok: true, target: b.exception, note: "day off removed" } : reasons(r.reason);
	},
);

const WindowSchema = z.object({ start: Minutes, end: Minutes, modes: z.array(Mode).min(1) });

const setAlternating = action(
	"hours/alternating",
	z.object({ brand: BrandName, practitioner: Id, anchor: Day.nullable() }),
	async (b, { tenant, actor, staff }) => {
		const r = await staff.setAlternating({
			tenant,
			practitioner: b.practitioner,
			anchor: b.anchor,
			actor,
		});
		return r.ok
			? {
					ok: true,
					target: b.practitioner,
					note: `alternating weeks ${b.anchor === null ? "off" : `from ${b.anchor}`}`,
				}
			: reasons(r.reason);
	},
);

const setPeriod = action(
	"hours/period/set",
	z.object({
		brand: BrandName,
		practitioner: Id,
		from: Day,
		until: Day.optional(),
		week: z.enum(["A", "B"]).optional(),
		days: z
			.array(
				z.object({
					weekday: z.number().int().min(1).max(7),
					windows: z.array(WindowSchema).max(8),
				}),
			)
			.max(7),
	}),
	async (b, { tenant, actor, staff }) => {
		const r = await staff.setPeriod({
			tenant,
			practitioner: b.practitioner,
			from: b.from,
			days: b.days,
			...(b.until === undefined ? {} : { until: b.until }),
			...(b.week === undefined ? {} : { week: b.week }),
			actor,
		});
		return r.ok
			? {
					ok: true,
					target: b.practitioner,
					note: `period from ${b.from}: +${r.added} -${r.removed}`,
				}
			: reasons(r.reason);
	},
);

const removePeriod = action(
	"hours/period/remove",
	z.object({ brand: BrandName, practitioner: Id, from: Day }),
	async (b, { tenant, actor, staff }) => {
		const r = await staff.removePeriod({
			tenant,
			practitioner: b.practitioner,
			from: b.from,
			actor,
		});
		return r.ok
			? { ok: true, target: b.practitioner, note: `period ${b.from} removed` }
			: reasons(r.reason);
	},
);

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

export const schedulingSetupEndpoints: Endpoint[] = [
	setAlternating,
	setPeriod,
	removePeriod,
	createRoom,
	updateRoom,
	addClosure,
	removeClosure,
	decideFromCalendar,
	rescheduleFromCalendar,
	board,
	state,
	preview,
	createPractitioner,
	updatePractitioner,
	createService,
	updateService,
	setDay,
	removeRule,
	addDaysOff,
	removeDayOff,
];
