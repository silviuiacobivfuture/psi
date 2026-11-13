import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The durable half of the notification layer (`@psi/notify`): triggers waiting for Novu, and the reminder links already
 * used. The outbox body is the trigger as the notifier built it (workflow, recipient, the typed payload with names, times
 * and signed links): no ciphertext and no secret, but personal data, so a job is removed the moment Novu has it.
 */
export const notifyOutbox = defineTable({
	/** The job id; one row per id. */
	key: v.string(),
	idempotencyKey: v.string(),
	app: v.string(),
	event: v.string(),
	/** The trigger body as JSON text. */
	bodyJson: v.string(),
	attempts: v.number(),
	replays: v.number(),
	dueAt: v.number(),
	createdAt: v.number(),
})
	.index("by_key", ["key"])
	.index("by_due", ["dueAt"]);

/** A one-time link that was used: exactly one claim of a `jti` ever succeeds. Rows go once the link has expired. */
export const usedLinks = defineTable({
	jti: v.string(),
	usedAt: v.number(),
	expiresAt: v.number(),
})
	.index("by_jti", ["jti"])
	.index("by_expires", ["expiresAt"]);
