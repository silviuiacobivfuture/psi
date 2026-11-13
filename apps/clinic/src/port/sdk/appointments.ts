import { SchedulingApiError } from "@psi/scheduling-sdk";
import { type Conflict, findConflicts as clash, type Probe } from "../../domain/conflicts";
import { PortError } from "../port";
import type {
	Appointment,
	AppointmentPatch,
	AppSlug,
	Client,
	NewAppointment,
	NewClient,
	PaymentMethod,
} from "../schema";
import type { SdkContext } from "./context";
import { appointmentOf, clientOf, drain } from "./map";
import { instantOf } from "./time";

const soon = (what: string): PortError => new PortError("not-available-yet", what);
const MINUTE = 60_000;

/** Appointments over the service: make, change, cancel, take payment, look for clashes, and add a client. */
export function appointmentsGroup(sdk: SdkContext) {
	const { api, run } = sdk;

	/** A room or a device is a column of its own kind: the service has one slot of each per appointment. */
	async function resources(
		app: AppSlug,
		ids: ReadonlyArray<string>,
	): Promise<{ roomId?: string; deviceId?: string }> {
		if (ids.length === 0) return {};
		const [rooms, devices] = await Promise.all([
			drain((cursor) =>
				api.rooms.list({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }),
			),
			drain((cursor) =>
				api.devices.list({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }),
			),
		]);
		const room = ids.filter((id) => rooms.some((r) => r.id === id));
		const device = ids.filter((id) => devices.some((d) => d.id === id));
		if (room.length + device.length !== ids.length)
			throw new PortError("invalid", "unknown resource");
		if (room.length > 1 || device.length > 1)
			throw soon("more than one room or device on an appointment");
		return {
			...(room[0] === undefined ? {} : { roomId: room[0] }),
			...(device[0] === undefined ? {} : { deviceId: device[0] }),
		};
	}

	async function durationOf(app: AppSlug, serviceId: string, asked?: number): Promise<number> {
		if (asked !== undefined) return asked;
		const all = await drain((cursor) =>
			api.services.list({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }),
		);
		const found = all.find((s) => s.id === serviceId);
		if (found === undefined) throw new PortError("invalid", "unknown service");
		return found.durationMinutes;
	}

	return {
		appointment: (app: AppSlug, id: string): Promise<Appointment | null> =>
			run(async () => {
				const tz = await sdk.zone(app);
				try {
					return appointmentOf(await api.appointments.get({ app, id }), tz);
				} catch (error) {
					if (error instanceof SchedulingApiError && error.code === "not_found") return null;
					throw error;
				}
			}),

		createAppointments: (
			app: AppSlug,
			input: NewAppointment,
		): Promise<ReadonlyArray<Appointment>> =>
			run(async () => {
				if (input.recurrence != null) throw soon("a weekly series of appointments");
				const tz = await sdk.zone(app);
				const minutes = await durationOf(app, input.serviceId, input.durationMin);
				const start = instantOf(input.date, input.startMin, tz);
				const made = await api.appointments.create({
					app,
					kind: "session",
					practitionerId: input.columnId,
					clientId: input.clientId,
					serviceId: input.serviceId,
					start,
					end: start + minutes * MINUTE,
					...(input.note === undefined || input.note === "" ? {} : { note: input.note }),
					...(input.packageId == null ? {} : { packageId: input.packageId }),
					...(input.priceBani === undefined ? {} : { priceCents: input.priceBani }),
					...(input.status === "requested" ? { status: "requested" as const } : {}),
					...(input.remind === false ? { remind: false } : {}),
					...(await resources(app, input.resourceIds ?? [])),
				});
				return [appointmentOf(made, tz)];
			}),

		updateAppointment: (app: AppSlug, id: string, patch: AppointmentPatch): Promise<Appointment> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const held = appointmentOf(await api.appointments.get({ app, id }), tz);
				const changes = (key: keyof AppointmentPatch): boolean =>
					patch[key] !== undefined && patch[key] !== held[key];
				// Cancelling has its reason (`cancelAppointment`), and a confirmed one never goes back to waiting.
				if (patch.status === "cancelled" || (patch.status === "requested" && changes("status")))
					throw new PortError("invalid", "cancel an appointment with its reason");
				const confirms = held.status === "requested" && patch.status === "confirmed";
				const startMin = patch.startMin ?? held.startMin;
				const date = patch.date ?? held.date;
				const timed = changes("date") || changes("startMin") || changes("durationMin");
				const start = instantOf(date, startMin, tz);
				const wanted = patch.resourceIds ?? held.resourceIds;
				const moved = patch.resourceIds !== undefined && wanted.join() !== held.resourceIds.join();
				const place = moved ? await resources(app, wanted) : {};
				const body = {
					...(patch.columnId !== undefined && patch.columnId !== held.columnId
						? { practitionerId: patch.columnId }
						: {}),
					...(timed
						? { start, end: start + (patch.durationMin ?? held.durationMin) * MINUTE }
						: {}),
					...(changes("note") ? { note: patch.note } : {}),
					...(changes("clientId") ? { clientId: patch.clientId } : {}),
					...(changes("serviceId") ? { serviceId: patch.serviceId } : {}),
					...(changes("priceBani") ? { priceCents: patch.priceBani } : {}),
					...(changes("remind") ? { remind: patch.remind } : {}),
					// `null` takes it out of its package; a package is chosen by id.
					...(patch.packageId === null && held.packageId !== null ? { packageId: null } : {}),
					...(patch.packageId != null && patch.packageId !== held.packageId
						? { packageId: patch.packageId }
						: {}),
					...place,
				};
				let latest = held;
				if (Object.keys(body).length > 0)
					latest = appointmentOf(await api.appointments.update({ app, id, ...body }), tz);
				if (confirms) latest = appointmentOf(await api.appointments.confirm({ app, id }), tz);
				else if (patch.status !== undefined && patch.status !== held.status)
					latest = appointmentOf(
						await api.appointments.attendance({
							app,
							id,
							status:
								patch.status === "confirmed"
									? "scheduled"
									: patch.status === "no-show"
										? "no_show"
										: patch.status === "attended"
											? "attended"
											: "scheduled",
						}),
						tz,
					);
				return latest;
			}),

		cancelAppointment: (app: AppSlug, id: string, reason: string): Promise<Appointment> =>
			run(async () => {
				const tz = await sdk.zone(app);
				return appointmentOf(await api.appointments.cancel({ app, id, reason }), tz);
			}),

		collectPayment: (app: AppSlug, id: string, method: PaymentMethod): Promise<Appointment> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const held = await api.appointments.get({ app, id });
				const owed = (held.money?.priceCents ?? 0) - (held.money?.paidCents ?? 0);
				if (owed <= 0) throw new PortError("invalid", "nothing is owed for this appointment");
				return appointmentOf(
					await api.appointments.pay({ app, id, amountCents: owed, method }),
					tz,
				);
			}),

		/** The service refuses a double booking on its own; this shows the clash BEFORE saving, from that day's calendar. */
		findConflicts: (app: AppSlug, probe: Probe): Promise<ReadonlyArray<Conflict>> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const day = await api.calendar.get({
					app,
					from: instantOf(probe.date, 0, tz),
					to: instantOf(probe.date, 24 * 60, tz),
					columns: "person",
				});
				const all = day.columns.flatMap((c) => c.appointments.map((a) => appointmentOf(a, tz)));
				return clash(all, probe);
			}),

		createClient: (app: AppSlug, input: NewClient): Promise<Client> =>
			run(async () =>
				clientOf(
					await api.clients.create({
						app,
						name: input.name,
						...(input.phone === null && !input.email
							? {}
							: {
									contact: {
										...(input.phone === null ? {} : { phone: input.phone }),
										...(input.email ? { email: input.email } : {}),
									},
								}),
						...(input.guardian === null ? {} : { guardian: { name: input.guardian } }),
						...(input.birthYear === undefined ? {} : { birthYear: input.birthYear }),
					}),
				),
			),
	};
}
