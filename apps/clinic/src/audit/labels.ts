import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { AuditSource } from "../port/schema";

type Say = (locale: Locale) => string;

/**
 * Every action code the service or the console records, each to ONE label key: a code the people reading the journal
 * never see raw. Synonyms (`update`/`edit`) share a key.
 */
const ACTION_KEY: Readonly<Record<string, string>> = {
	"appointment.create": "appointment_create",
	"appointment.edit": "appointment_edit",
	"appointment.update": "appointment_edit",
	"appointment.cancel": "appointment_cancel",
	"appointment.delete": "appointment_delete",
	"appointment.restore": "appointment_restore",
	"appointment.attendance": "appointment_attendance",
	"appointment.payment": "payment_add",
	"payment.create": "payment_add",
	"package.payment": "payment_add",
	"payment.delete": "payment_delete",
	"client.create": "client_create",
	"client.edit": "client_edit",
	"client.update": "client_edit",
	"client.archive": "client_archive",
	"client.restore": "client_restore",
	"client.delete": "client_delete",
	"client.assign": "client_assign",
	"package.create": "package_create",
	"package.edit": "package_edit",
	"package.update": "package_edit",
	"package.delete": "package_delete",
	"reminder.send": "reminder_send",
	"reminder.email": "reminder_send",
	"reminder.mark": "reminder_mark",
	"request.handled": "request_handled",
	"request.decide": "request_handled",
	"role.save": "role_edit",
	"role.update": "role_edit",
	"role.permissions": "role_edit",
	"role.create": "role_create",
	"role.delete": "role_delete",
	"member.put": "member_edit",
	"member.overrides": "member_edit",
	"member.remove": "member_remove",
	"member.invite": "member_invite",
	"member.link": "member_link",
	"service.price": "service_price",
	"floorplan.put": "plan_save",
	"assistant.config.put": "assistant_save",
	"assistant.platform.put": "assistant_save",
	"floor-plan.save": "plan_save",
	"view_as.start": "view_as_start",
	"view_as.stop": "view_as_stop",
	"feedback.link": "feedback_link",
	"feedback.reply": "feedback_reply",
	"feedback.status": "feedback_status",
	"file.init": "file_add",
	"file.complete": "file_add",
	"file.delete": "file_delete",
	"record.create": "record_create",
	"record.update": "record_edit",
	"record.delete": "record_delete",
	"leave.create": "leave_create",
	"leave.decide": "leave_decide",
	"roster.put": "roster_put",
	"blacklist.create": "blacklist_edit",
	"blacklist.update": "blacklist_edit",
	"blacklist.delete": "blacklist_edit",
	"callback.create": "callback_create",
	"request.create": "request_create",
	"app.create": "app_edit",
	"app.update": "app_edit",
	"builder.put": "builder_edit",
	"builder.delete": "builder_edit",
	"visitor.cancel": "visitor_cancel",
};

const ACTION_SAY: Readonly<Record<string, Say>> = {
	appointment_create: (l) => m.jr_act_appointment_create({}, at(l)),
	appointment_edit: (l) => m.jr_act_appointment_edit({}, at(l)),
	appointment_cancel: (l) => m.jr_act_appointment_cancel({}, at(l)),
	appointment_delete: (l) => m.jr_act_appointment_delete({}, at(l)),
	appointment_restore: (l) => m.jr_act_appointment_restore({}, at(l)),
	appointment_attendance: (l) => m.jr_act_appointment_attendance({}, at(l)),
	payment_add: (l) => m.jr_act_payment_add({}, at(l)),
	payment_delete: (l) => m.jr_act_payment_delete({}, at(l)),
	client_create: (l) => m.jr_act_client_create({}, at(l)),
	client_edit: (l) => m.jr_act_client_edit({}, at(l)),
	client_archive: (l) => m.jr_act_client_archive({}, at(l)),
	client_restore: (l) => m.jr_act_client_restore({}, at(l)),
	client_delete: (l) => m.jr_act_client_delete({}, at(l)),
	client_assign: (l) => m.jr_act_client_assign({}, at(l)),
	package_create: (l) => m.jr_act_package_create({}, at(l)),
	package_edit: (l) => m.jr_act_package_edit({}, at(l)),
	package_delete: (l) => m.jr_act_package_delete({}, at(l)),
	reminder_send: (l) => m.jr_act_reminder_send({}, at(l)),
	reminder_mark: (l) => m.jr_act_reminder_mark({}, at(l)),
	request_handled: (l) => m.jr_act_request_handled({}, at(l)),
	role_edit: (l) => m.jr_act_role_edit({}, at(l)),
	role_create: (l) => m.jr_act_role_create({}, at(l)),
	role_delete: (l) => m.jr_act_role_delete({}, at(l)),
	member_edit: (l) => m.jr_act_member_edit({}, at(l)),
	member_remove: (l) => m.jr_act_member_remove({}, at(l)),
	member_invite: (l) => m.jr_act_member_invite({}, at(l)),
	member_link: (l) => m.jr_act_member_link({}, at(l)),
	service_price: (l) => m.jr_act_service_price({}, at(l)),
	plan_save: (l) => m.jr_act_plan_save({}, at(l)),
	assistant_save: (l) => m.jr_act_assistant_save({}, at(l)),
	view_as_start: (l) => m.jr_act_view_as_start({}, at(l)),
	view_as_stop: (l) => m.jr_act_view_as_stop({}, at(l)),
	feedback_link: (l) => m.jr_act_feedback_link({}, at(l)),
	feedback_reply: (l) => m.jr_act_feedback_reply({}, at(l)),
	feedback_status: (l) => m.jr_act_feedback_status({}, at(l)),
	file_add: (l) => m.jr_act_file_add({}, at(l)),
	file_delete: (l) => m.jr_act_file_delete({}, at(l)),
	record_create: (l) => m.jr_act_record_create({}, at(l)),
	record_edit: (l) => m.jr_act_record_edit({}, at(l)),
	record_delete: (l) => m.jr_act_record_delete({}, at(l)),
	leave_create: (l) => m.jr_act_leave_create({}, at(l)),
	leave_decide: (l) => m.jr_act_leave_decide({}, at(l)),
	roster_put: (l) => m.jr_act_roster_put({}, at(l)),
	blacklist_edit: (l) => m.jr_act_blacklist_edit({}, at(l)),
	callback_create: (l) => m.jr_act_callback_create({}, at(l)),
	request_create: (l) => m.jr_act_request_create({}, at(l)),
	app_edit: (l) => m.jr_act_app_edit({}, at(l)),
	builder_edit: (l) => m.jr_act_builder_edit({}, at(l)),
	visitor_cancel: (l) => m.jr_act_visitor_cancel({}, at(l)),
};

const ASSISTANT = /^assistant\./;

/** The action's family key (`client_edit`): what the sentences and the labels are looked up by; `other` when unknown. */
export function actionKey(code: string): string {
	return ACTION_KEY[code.replace(ASSISTANT, "")] ?? "other";
}

/** An action code for people, never the raw code; an assistant's note says so. */
export function actionLabel(code: string, locale: Locale): string {
	const base = ACTION_SAY[actionKey(code)]?.(locale) ?? m.jr_act_other({}, at(locale));
	return ASSISTANT.test(code) ? m.jr_via_assistant({ what: base }, at(locale)) : base;
}

/** The action keys that exist (for the filter's list), each with its label, in the order people read them. */
export function actionChoices(locale: Locale): ReadonlyArray<{ key: string; label: string }> {
	return [...new Set(Object.values(ACTION_KEY))].map((key) => ({
		key,
		label: ACTION_SAY[key]?.(locale) ?? m.jr_act_other({}, at(locale)),
	}));
}

const SOURCE_SAY: Readonly<Record<AuditSource | "unknown", Say>> = {
	console: (l) => m.jr_src_console({}, at(l)),
	assistant: (l) => m.jr_src_assistant({}, at(l)),
	site: (l) => m.jr_src_site({}, at(l)),
	import: (l) => m.jr_src_import({}, at(l)),
	"api-key": (l) => m.jr_src_api_key({}, at(l)),
	unknown: (l) => m.jr_src_unknown({}, at(l)),
};

export const sourceLabel = (source: AuditSource | undefined, locale: Locale): string =>
	SOURCE_SAY[source ?? "unknown"](locale);

/** The kinds of object an event can be about, as the filter offers them. */
export const OBJECT_TYPES = [
	"appointment",
	"client",
	"package",
	"request",
	"reminder",
	"role",
	"member",
	"service",
	"payment",
	"plan",
	"file",
	"record",
	"feedback",
	"leave",
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number] | "other";

const TYPE_ALIAS: Readonly<Record<string, ObjectType>> = {
	"floor-plan": "plan",
	floorplan: "plan",
	view_as: "member",
	members: "member",
	blacklist: "client",
	roster: "leave",
	calendar: "appointment",
};

/** The type of object an event is about, folded to the ones people know (`other` when none fits). */
export function objectTypeOf(raw: string): ObjectType {
	const t = raw.replace(ASSISTANT, "");
	const found = OBJECT_TYPES.find((x) => x === t);
	return found ?? TYPE_ALIAS[t] ?? "other";
}

const TYPE_SAY: Readonly<Record<ObjectType, Say>> = {
	appointment: (l) => m.jr_t_appointment({}, at(l)),
	client: (l) => m.jr_t_client({}, at(l)),
	package: (l) => m.jr_t_package({}, at(l)),
	request: (l) => m.jr_t_request({}, at(l)),
	reminder: (l) => m.jr_t_reminder({}, at(l)),
	role: (l) => m.jr_t_role({}, at(l)),
	member: (l) => m.jr_t_member({}, at(l)),
	service: (l) => m.jr_t_service({}, at(l)),
	payment: (l) => m.jr_t_payment({}, at(l)),
	plan: (l) => m.jr_t_plan({}, at(l)),
	file: (l) => m.jr_t_file({}, at(l)),
	record: (l) => m.jr_t_record({}, at(l)),
	feedback: (l) => m.jr_t_feedback({}, at(l)),
	leave: (l) => m.jr_t_leave({}, at(l)),
	other: (l) => m.jr_t_other({}, at(l)),
};

export const typeLabel = (t: ObjectType, locale: Locale): string => TYPE_SAY[t](locale);

const FIELD_SAY: Readonly<Record<string, Say>> = {
	status: (l) => m.jr_fld_status({}, at(l)),
	date: (l) => m.jr_fld_date({}, at(l)),
	startMin: (l) => m.jr_fld_startMin({}, at(l)),
	durationMin: (l) => m.jr_fld_durationMin({}, at(l)),
	columnId: (l) => m.jr_fld_columnId({}, at(l)),
	clientId: (l) => m.jr_fld_clientId({}, at(l)),
	serviceId: (l) => m.jr_fld_serviceId({}, at(l)),
	note: (l) => m.jr_fld_note({}, at(l)),
	resourceIds: (l) => m.jr_fld_resourceIds({}, at(l)),
	packageId: (l) => m.jr_fld_packageId({}, at(l)),
	priceBani: (l) => m.jr_fld_priceBani({}, at(l)),
	remind: (l) => m.jr_fld_remind({}, at(l)),
	phone: (l) => m.jr_fld_phone({}, at(l)),
	email: (l) => m.jr_fld_email({}, at(l)),
	name: (l) => m.jr_fld_name({}, at(l)),
	guardian: (l) => m.jr_fld_guardian({}, at(l)),
	birthYear: (l) => m.jr_fld_birthYear({}, at(l)),
	roles: (l) => m.jr_fld_roles({}, at(l)),
	grants: (l) => m.jr_fld_grants({}, at(l)),
	denies: (l) => m.jr_fld_denies({}, at(l)),
	coordinates: (l) => m.jr_fld_coordinates({}, at(l)),
	displayName: (l) => m.jr_fld_displayName({}, at(l)),
};

export const fieldLabel = (field: string, locale: Locale): string =>
	FIELD_SAY[field]?.(locale) ?? m.jr_fld_other({ field }, at(locale));
