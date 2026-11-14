import type { AuditAction, AuditEntity } from "@psi/scheduling/clinic";

/**
 * The API's audit events and Convex's are two vocabularies. Convex's log is deliberately closed: an action and an entity
 * from fixed lists, field NAMES and a count, no free text, so no name, diagnosis or note can reach it. The wrappers
 * already write their own event in the same transaction as the write, so the HTTP layer's event for the same change
 * must not be written again (`recorded`): one mutation, one event. Everything a wrapper does not record is appended here,
 * mapped to the closest action and entity.
 *
 * What the closed log cannot say, on Convex: the values of `detail` (who a client moved from and to, the reason given),
 * and the API's own action name when two API actions share one Convex action. A team change is the exception: its
 * wrapper keeps the before and after (roles, calendars, grants, denials, who left) and names the member by subject. The API action, the target's type and a
 * service actor travel as FIELD names (`api.<action>`, `type.<type>`, `by.service`), which the service reads back.
 */
export interface Mapping {
	action: AuditAction;
	entity: AuditEntity;
	/** A wrapper writes this event itself; the service writes nothing. */
	recorded: boolean;
}

const rec = (action: AuditAction, entity: AuditEntity): Mapping => ({
	action,
	entity,
	recorded: true,
});
const own = (action: AuditAction, entity: AuditEntity): Mapping => ({
	action,
	entity,
	recorded: false,
});

/** API audit action -> Convex. Keep `recorded` true only where a wrapper in packages/scheduling/convex writes the event. */
export const BY_API: Readonly<Record<string, Mapping>> = {
	"app.create": rec("app.create", "app"),
	"app.update": rec("builder.change", "app"),
	"member.put": rec("member.change", "member"),
	"member.remove": rec("member.change", "member"),
	"member.overrides": rec("override.change", "override"),
	// The addition itself is the wrapper's member.change; this event says it came by invitation (and whether an account was made).
	"member.invite": own("member.change", "member"),
	// A new set-password link was made for a member (never the link itself).
	"member.link": own("member.change", "member"),
	// Looking at the app as someone else changes nothing: the log has no word for it, so it is a settings-level event.
	"view_as.start": own("builder.change", "builder"),
	"view_as.stop": own("builder.change", "builder"),
	"role.create": rec("role.change", "role"),
	"role.update": rec("role.change", "role"),
	"role.permissions": rec("role.change", "role"),
	"role.delete": rec("role.change", "role"),
	"people.create": own("member.change", "member"),
	"people.update": own("member.change", "member"),
	"people.delete": own("member.change", "member"),
	"rooms.create": rec("builder.change", "builder"),
	"rooms.update": rec("builder.change", "builder"),
	"rooms.delete": rec("builder.change", "builder"),
	"devices.create": rec("builder.change", "builder"),
	"devices.update": rec("builder.change", "builder"),
	"devices.delete": rec("builder.change", "builder"),
	"groups.create": rec("builder.change", "builder"),
	"groups.update": rec("builder.change", "builder"),
	"groups.delete": rec("builder.change", "builder"),
	"services.create": own("builder.change", "builder"),
	"services.update": own("builder.change", "builder"),
	"services.delete": own("builder.change", "builder"),
	"service.price": own("builder.change", "builder"),
	"client.create": rec("client.create", "client"),
	"client.update": rec("client.update", "client"),
	"client.assign": rec("client.practitioner_change", "client"),
	"client.archive": rec("client.archive", "client"),
	"client.restore": rec("client.unarchive", "client"),
	// The closed log has no word for an online-account invitation; the API's own action travels as a field name.
	"client.invite": own("client.update", "client"),
	"client.invite_resend": own("client.update", "client"),
	"client.invite_revoke": own("client.update", "client"),
	"client.invite_activated": own("client.update", "client"),
	"notifications.prefs": own("member.change", "member"),
	"visitor.notifications": own("builder.change", "builder"),
	"client.delete": rec("client.delete", "client"),
	"appointment.create": rec("visit.create", "visit"),
	"appointment.update": rec("visit.update", "visit"),
	"appointment.cancel": rec("visit.cancel", "visit"),
	"appointment.attendance": rec("visit.update", "visit"),
	"appointment.confirm": rec("visit.update", "visit"),
	"series.create": rec("visit.create", "visit"),
	"series.update": rec("visit.update", "visit"),
	"series.cancel": rec("visit.cancel", "visit"),
	"appointment.payment": rec("payment.add", "payment"),
	"appointment.delete": rec("visit.cancel", "visit"),
	"appointment.restore": rec("visit.update", "visit"),
	"package.create": rec("package.create", "package"),
	"package.update": rec("package.update", "package"),
	"package.delete": rec("package.update", "package"),
	"payment.create": rec("payment.add", "payment"),
	"payment.delete": own("payment.refund", "payment"),
	"roster.put": rec("roster.set", "roster"),
	"leave.create": own("staff_block.set", "staff_block"),
	"leave.decide": own("staff_block.set", "staff_block"),
	"reminder.mark": own("visit.update", "visit"),
	"reminder.email": own("visit.update", "visit"),
	"request.decide": own("visit.update", "visit"),
	"record.create": rec("record.write", "record"),
	"record.update": rec("record.write", "record"),
	"record.delete": rec("record.write", "record"),
	"file.init": rec("file.add", "file"),
	"file.complete": own("file.add", "file"),
	"file.delete": rec("file.remove", "file"),
	"file.download": own("file.read", "file"),
	"blacklist.create": rec("blacklist.create", "blacklist"),
	"blacklist.update": rec("blacklist.update", "blacklist"),
	"blacklist.delete": rec("blacklist.delete", "blacklist"),
	"feedback.link": rec("feedback.link", "feedback"),
	"feedback.reply": rec("feedback.reply", "feedback"),
	"feedback.status": rec("feedback.status", "feedback"),
	"floorplan.put": own("builder.change", "builder"),
	"assistant.config.put": own("builder.change", "builder"),
	// The estate's own journal entry is written by `apiAssistant:putPlatform` (no app holds it).
	"assistant.platform.put": rec("builder.change", "app"),
	"report.export": own("report.export", "report"),
	"note.create": rec("note.create", "note"),
	"note.update": rec("note.update", "note"),
	"note.delete": rec("note.delete", "note"),
	"builder.put": rec("builder.change", "builder"),
	"builder.delete": rec("builder.change", "builder"),
	"clinical.read": own("record.read", "client"),
	"callback.create": own("visit.create", "visit"),
	"request.create": own("visit.create", "visit"),
	"visitor.cancel": own("visit.cancel", "visit"),
};

/**
 * The mapping of one event. A clinical read of a RECORD is written by `apiRecords:readRecord` itself; of a client (its
 * clinical group) nothing writes it, so it is appended against the client.
 */
export function mappingOf(action: string, target: { type: string }): Mapping {
	// A clinical read of a RECORD is written by `apiRecords:readRecord`; of a client's clinical group, nothing writes it.
	if (action === "clinical.read" && target.type === "record") return rec("record.read", "record");
	return BY_API[action] ?? own("builder.change", "builder");
}

/** The API's target type for a Convex entity, when the event carries no `type.` field (a wrapper wrote it). */
const TYPE_OF_ENTITY: Readonly<Partial<Record<AuditEntity, string>>> = {
	app: "apps",
	member: "members",
	override: "members",
	role: "roles",
	client: "clients",
	visit: "appointments",
	package: "packages",
	payment: "payments",
	roster: "roster",
	staff_block: "roster",
	record: "records",
	file: "files",
	form: "builder",
	builder: "builder",
	blacklist: "blacklist",
	feedback: "feedback",
	report: "reports",
	note: "notes",
};
export const typeOfEntity = (entity: string): string =>
	TYPE_OF_ENTITY[entity as AuditEntity] ?? entity;

const firstRecorded = (action: string, entity: string): string | undefined =>
	Object.entries(BY_API).find(
		([, m]) => m.recorded && m.action === action && m.entity === entity,
	)?.[0];

/** A wrapper's event named in the API's words: the first API action of that Convex action and entity, refined by field names. */
export function apiActionOf(action: string, entity: string, fields: readonly string[]): string {
	const deleted = fields.includes("deleted");
	switch (`${action}|${entity}`) {
		case "role.change|role":
			return deleted
				? "role.delete"
				: fields.includes("permissions")
					? "role.permissions"
					: fields.length === 0
						? "role.create"
						: "role.update";
		case "member.change|member":
			return deleted ? "member.remove" : "member.put";
		case "package.update|package":
			return deleted ? "package.delete" : "package.update";
		case "record.write|record":
			return fields.length === 0 ? "record.create" : "record.update";
		case "builder.change|builder":
			return deleted ? "builder.delete" : "builder.put";
		case "visit.cancel|visit":
			return "appointment.cancel";
		case "client.unarchive|client":
			return "client.restore";
		case "client.practitioner_change|client":
			return "client.assign";
		case "payment.add|payment":
			return "payment.create";
		case "payment.refund|payment":
			return "payment.delete";
		case "roster.set|roster":
		case "staff_block.set|staff_block":
			return "roster.put";
		case "record.read|record":
		case "record.read|client":
			return "clinical.read";
		case "file.add|file":
			return "file.init";
		case "file.remove|file":
			return "file.delete";
		case "file.read|file":
			return "file.download";
		case "override.change|override":
			return "member.overrides";
		case "builder.change|app":
			return "app.update";
		case "form.define|form":
			return "builder.put";
		default:
			return firstRecorded(action, entity) ?? action;
	}
}
