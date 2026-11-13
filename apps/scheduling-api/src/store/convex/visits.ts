import { appointmentCollection } from "./appointments";
import type { PartialCollections } from "./collections";
import { packageCollection, paymentCollection } from "./money";
import { reminderCollection } from "./reminders";
import type { Rpc } from "./rpc";

/** Appointments (Convex visits), packages, payments and reminders over the server-keyed wrappers. */
export function visitCollections(rpc: Rpc): PartialCollections {
	return {
		appointments: appointmentCollection(rpc),
		packages: packageCollection(rpc),
		payments: paymentCollection(rpc),
		reminders: reminderCollection(rpc),
	};
}
