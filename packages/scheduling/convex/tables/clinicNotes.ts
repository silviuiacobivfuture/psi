import { defineTable } from "convex/server";
import { v } from "convex/values";
import { encryptedValidator } from "../validators";

/** The categories of a note; `clinic` is the one kept as ciphertext. */
export const noteCategoryValidator = v.union(
	v.literal("general"),
	v.literal("administrativ"),
	v.literal("plata"),
	v.literal("comportament"),
	v.literal("clinic"),
);

/**
 * Staff notes about a client. A `clinic` note carries `textEnc` (ciphertext the service sealed; Convex never decrypts it)
 * and no `text`; every other category carries `text` and no `textEnc`. The row is the client's: erasing the client erases
 * its notes.
 */
export const clientNotes = defineTable({
	tenant: v.string(),
	client: v.id("clients"),
	category: noteCategoryValidator,
	text: v.optional(v.string()),
	textEnc: v.optional(encryptedValidator),
	pinned: v.boolean(),
	/** The subject who wrote it: who may edit, delete or pin it when the key is held for `own` only. */
	author: v.string(),
	createdAt: v.number(),
	updatedAt: v.number(),
	version: v.number(),
})
	.index("by_tenant_client", ["tenant", "client", "createdAt"])
	.index("by_tenant_created", ["tenant", "createdAt"]);
