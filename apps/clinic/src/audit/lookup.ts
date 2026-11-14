import { roleLabel } from "../chrome";
import type { Ctx } from "../lib/context";
import type {
	Appointment,
	AuditEvent,
	Client,
	Column,
	Package,
	Service,
	WebRequest,
} from "../port/schema";
import { type ObjectType, objectTypeOf } from "./labels";

/** The object an event is about: its folded type and its id (the store kept `type:id`, or only the id). */
export interface AuditObject {
	type: ObjectType;
	id: string;
}

export function objectOf(e: AuditEvent): AuditObject {
	const colon = e.target.indexOf(":");
	const rawType = e.targetType ?? (colon > 0 ? e.target.slice(0, colon) : e.action.split(".")[0]);
	const id = e.targetId ?? (colon > 0 ? e.target.slice(colon + 1) : e.target);
	return { type: objectTypeOf(rawType ?? ""), id };
}

export interface Person {
	name: string;
	/** The roles' names, in the viewer's language. */
	roles: ReadonlyArray<string>;
}

/** What the journal needs to say names instead of ids; whatever a lookup could not answer is simply absent. */
export interface AuditLookup {
	clients: ReadonlyMap<string, Client>;
	appointments: ReadonlyMap<string, Appointment>;
	packages: ReadonlyMap<string, Package>;
	columns: ReadonlyMap<string, Column>;
	services: ReadonlyMap<string, Service>;
	requests: ReadonlyMap<string, WebRequest>;
	roles: ReadonlyMap<string, string>;
	/** By subject: the team's names. */
	people: ReadonlyMap<string, Person>;
}

const settled = async <T>(p: Promise<ReadonlyArray<T>>): Promise<ReadonlyArray<T>> =>
	p.catch(() => []);
const byId = <T extends { id: string }>(rows: ReadonlyArray<T>): Map<string, T> =>
	new Map(rows.map((r) => [r.id, r]));

/** The most appointments one page asks about by id: the page is as long as the person can read. */
const APPOINTMENT_LOOKUPS = 250;
const PACKAGE_CLIENTS = 80;

/**
 * Names for the objects of `events`. Each source is asked independently: a person who may not read requests (or a service
 * that answers 503 for one list) still gets the rest, and an unresolved object is shown by its kind, never by its id.
 */
export async function loadLookup(
	ctx: Ctx,
	events: ReadonlyArray<AuditEvent>,
): Promise<AuditLookup> {
	const { port, app } = ctx;
	const idsOf = (type: ObjectType): string[] => [
		...new Set(
			events
				.map(objectOf)
				.filter((o) => o.type === type)
				.map((o) => o.id),
		),
	];
	const wanted = idsOf("appointment").slice(0, APPOINTMENT_LOOKUPS);
	const [columns, services, requests, roles, members, found] = await Promise.all([
		settled(port.columns(app)),
		settled(port.services(app)),
		// The newest requests, open and handled, name the journal's; an older one is said by its kind.
		ctx.can.has("web_requests_view") && idsOf("request").length > 0
			? settled(
					Promise.all([
						port.requestPage(app, "open", null),
						port.requestPage(app, "handled", null),
					]).then(([a, b]) => [...a.items, ...b.items]),
				)
			: Promise.resolve([]),
		settled(port.roles(app)),
		settled(port.members(app)),
		Promise.all(wanted.map((id) => port.appointment(app, id).catch(() => null))),
	]);
	const appointments = found.filter((a): a is Appointment => a !== null);
	// Only the clients the page names (the events' own and their appointments'), never the whole client list.
	const named = [
		...new Set([
			...idsOf("client"),
			...appointments.flatMap((a) => (a.clientId === null ? [] : [a.clientId])),
		]),
	];
	const clients = await settled(port.clientsByIds(app, named));
	// A package belongs to a client and has no lookup of its own: only asked when an event is about one.
	const aboutPackages = events.some((e) => objectOf(e).type === "package");
	const packages = aboutPackages
		? (
				await Promise.all(
					clients.slice(0, PACKAGE_CLIENTS).map((c) => port.packages(app, c.id).catch(() => [])),
				)
			).flat()
		: [];
	const roleNames = new Map(roles.map((r) => [r.id, roleLabel(r, ctx.locale)]));
	return {
		clients: byId(clients),
		appointments: byId(appointments),
		packages: byId(packages),
		columns: byId(columns),
		services: byId(services),
		requests: byId(requests),
		roles: roleNames,
		people: new Map(
			members.map((p) => [
				p.subject,
				{ name: p.displayName, roles: p.roles.map((r) => roleNames.get(r) ?? r) },
			]),
		),
	};
}

/** Who did it: the team's name for a subject, else what the store kept (a name, a key's label, an import's). */
export const actorName = (lookup: AuditLookup, actor: string): string =>
	lookup.people.get(actor)?.name ?? actor;
