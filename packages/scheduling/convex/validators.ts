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
