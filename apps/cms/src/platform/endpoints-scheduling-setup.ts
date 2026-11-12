import { ROOM_KINDS } from "@psi/scheduling";
import type { Endpoint } from "payload";
import { z } from "zod";
import {
	action,
	BrandName,
	Day,
	Id,
	Minutes,
	Mode,
	Name,
	reasons,
	Slug,
} from "./scheduling-action";
import { slugify } from "./scheduling-model";

/** The Scheduling setup's actions on people, services, hours, periods and days off (see scheduling-action.ts). */
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

export const schedulingSetupEndpoints: Endpoint[] = [
	createPractitioner,
	updatePractitioner,
	createService,
	updateService,
	setDay,
	removeRule,
	addDaysOff,
	removeDayOff,
	setAlternating,
	setPeriod,
	removePeriod,
];
