import { SchedulingApiError } from "@psi/scheduling-sdk";
import { type AvailabilityPort, SaveProblems, SaveRefusal } from "../availability-port";
import type { AppSlug } from "../schema";
import type { SdkContext } from "./context";
import { toPortError } from "./errors";
import { drain } from "./map";

/**
 * A refused save that carries its problems leaves as `SaveRefusal` (the page shows each beside its row); any other
 * refusal is the port's usual one. Thrown inside `run`, so the context passes it through as it is.
 */
async function withProblems<T>(call: () => Promise<T>): Promise<T> {
	try {
		return await call();
	} catch (error) {
		if (error instanceof SchedulingApiError && error.code === "invalid") {
			const detail = SaveProblems.safeParse(error.detail);
			if (detail.success) throw new SaveRefusal(`${error.code} (${error.requestId})`, detail.data);
		}
		throw error;
	}
}

/** A list some callers may not read (a practitioner without `people_view`): empty, never a failed page. */
async function orEmpty<T>(call: () => Promise<T[]>): Promise<T[]> {
	try {
		return await call();
	} catch (error) {
		if (toPortError(error).code === "forbidden") return [];
		throw error;
	}
}

/** The availability editor and the booking pauses, over the scheduling service's routes. */
export function availabilityGroup(sdk: SdkContext): AvailabilityPort {
	const { api, run } = sdk;
	return {
		practitioners: (app: AppSlug) =>
			run(async () => {
				const people = await orEmpty(() =>
					drain((cursor) =>
						api.people.list({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }),
					),
				);
				return people
					.filter((p) => p.active && p.kind === "practitioner")
					.map((p) => ({ id: p.id, name: p.displayName }));
			}),
		bookableServices: (app) =>
			run(async () => {
				const all = await orEmpty(() =>
					drain((cursor) =>
						api.services.list({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }),
					),
				);
				return all
					.filter((s) => s.active)
					.map((s) => ({
						slug: s.slug,
						name: s.name.ro,
						durationMin: s.durationMinutes,
						bufferMin: s.bufferMinutes,
					}));
			}),
		availability: (app, id, from) => run(() => api.availability.get({ app, id, from })),
		saveRules: (app, id, rules) =>
			run(() => withProblems(() => api.availability.rulesPut({ app, id, rules: [...rules] }))),
		copyRules: (app, from, to) =>
			run(() => withProblems(() => api.availability.copyRules({ app, from, to: [...to] }))),
		addOneOff: (app, personIds, entry) =>
			run(() =>
				withProblems(() =>
					api.availability.oneOffCreate({ app, personIds: [...personIds], entry }),
				),
			),
		removeOneOff: (app, id, entry) =>
			run(async () => {
				await api.availability.oneOffRemove({ app, id, entry });
			}),
		availabilityPreview: (app, id, service, from, to) =>
			run(() => api.availability.preview({ app, id, service, from, to })),
		roomClosures: (app, id, from) =>
			run(async () => (await api.rooms.closures({ app, id, from })).items),
		addRoomClosure: (app, id, input) =>
			run(() =>
				withProblems(async () => (await api.rooms.closureCreate({ app, id, ...input })).items),
			),
		removeRoomClosure: (app, id, closure) =>
			run(async () => {
				await api.rooms.closureRemove({ app, id, closure });
			}),
		bookingPauses: (app) => run(() => api.bookingPause.list({ app })),
		createPause: (app, input) => run(() => api.bookingPause.create({ app, ...input })),
		updatePause: (app, id, input) => run(() => api.bookingPause.update({ app, id, ...input })),
		removePause: (app, id) =>
			run(async () => {
				await api.bookingPause.remove({ app, id });
			}),
	};
}
