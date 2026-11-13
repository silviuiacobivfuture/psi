import { v } from "convex/values";

/** Validators shared by the schema and the functions' arguments. */

export const modeValidator = v.union(v.literal("onsite"), v.literal("online"));

export const audienceValidator = v.union(v.literal("child"), v.literal("teen"), v.literal("adult"));

export const statusValidator = v.union(
	v.literal("held"),
	v.literal("requested"),
	v.literal("confirmed"),
	v.literal("cancelled"),
	v.literal("declined"),
	v.literal("expired"),
);

/** Why the team declined or cancelled: `DECISION_REASONS`, a closed list, never clinical. */
export const decisionReasonValidator = v.union(
	v.literal("practitioner_unavailable"),
	v.literal("schedule_conflict"),
	v.literal("client_request"),
	v.literal("duplicate"),
	v.literal("no_response"),
	v.literal("administrative"),
);

export const channelValidator = v.union(v.literal("form"), v.literal("guide"), v.literal("staff"));

export const localeValidator = v.union(v.literal("ro"), v.literal("en"));

/** The contact a visitor typed into the booking form: a name and one way to reach them. */
export const contactValidator = v.object({
	name: v.string(),
	email: v.optional(v.string()),
	phone: v.optional(v.string()),
});

/** A staff member as the app authorised them: their subject id from the identity provider. */
export const actorValidator = v.object({ subject: v.string() });

/** The shared server key every function demands (see `guard.ts`). */
export const serverKeyValidator = v.string();

/** A service's name in both languages, as the team wrote it. */
export const serviceNameValidator = v.object({ ro: v.string(), en: v.string() });

// The clinic (docs/plans/clinic.md): shared by the clinic tables and the import functions.

/** A stored ciphertext (`src/crypto`): key version, IV and ciphertext, base64. Convex never decrypts. */
export const encryptedValidator = v.object({
	keyVersion: v.number(),
	iv: v.string(),
	data: v.string(),
});

export const clientStatusValidator = v.union(
	v.literal("active"),
	v.literal("paused"),
	v.literal("finished"),
);

export const paymentMethodValidator = v.union(
	v.literal("cash"),
	v.literal("card"),
	v.literal("transfer"),
);

export const attendanceValidator = v.union(
	v.literal("pending"),
	v.literal("attended"),
	v.literal("absent"),
);

export const creditTypeValidator = v.union(v.literal("base"), v.literal("bonus"));

export const rosterStatusValidator = v.union(
	v.literal("works"),
	v.literal("annual_leave"),
	v.literal("medical_leave"),
	v.literal("free"),
);

/** The column of the calendar a visit sits on: four distinct kinds, never mixed up. */
export const columnValidator = v.union(
	v.object({ kind: v.literal("practitioner"), id: v.id("practitioners") }),
	v.object({ kind: v.literal("device"), id: v.id("devices") }),
	v.object({ kind: v.literal("room"), id: v.id("rooms") }),
	v.object({ kind: v.literal("group"), id: v.id("groupActivities") }),
);

/** A person on the roster: a practitioner or another member of staff (reception, volunteer). */
export const personValidator = v.union(
	v.object({ kind: v.literal("practitioner"), id: v.id("practitioners") }),
	v.object({ kind: v.literal("staff"), id: v.id("staffMembers") }),
);

export const fileKindValidator = v.union(v.literal("client_file"), v.literal("notice"));

/**
 * What the staff API keeps about a visit that the calendar's own fields cannot hold: the API's kind (a session, a block of
 * time, a group activity), the practitioner (a group visit sits in the group's column), the group, the service and the
 * reason it was cancelled. Ids are the API's, opaque to Convex.
 */
export const visitMetaValidator = v.object({
	kind: v.union(v.literal("session"), v.literal("block"), v.literal("group")),
	practitioner: v.string(),
	group: v.optional(v.string()),
	service: v.optional(v.string()),
	cancelReason: v.optional(v.string()),
});

/** A staff override of a blacklist hit: why, and the authority the API vouches the person has. */
export const overrideValidator = v.object({
	reason: v.string(),
	authority: v.union(v.literal("ack"), v.literal("staff"), v.literal("admin")),
});
