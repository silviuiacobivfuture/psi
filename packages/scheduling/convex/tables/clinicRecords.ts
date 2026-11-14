import { defineTable } from "convex/server";
import { v } from "convex/values";
import { encryptedValidator, fileKindValidator } from "../validators";

/**
 * Clinical records and the builder. Everything clinical is ciphertext (`encryptedValidator`):
 * Convex never holds the master key, nor a data key unwrapped. Definitions (forms, custom fields,
 * views, actions) are JSON text parsed with zod at the boundary (`src/clinic`), so there is one
 * description of their shape.
 */

/** The per-app data keys, wrapped by the master key (which is never stored here). */
export const appKeys = defineTable({
	tenant: v.string(),
	version: v.number(),
	wrapped: encryptedValidator,
	status: v.union(v.literal("active"), v.literal("retired")),
	createdAt: v.number(),
}).index("by_tenant_version", ["tenant", "version"]);

/** A form template version; a response keeps the version it was written with. */
export const formDefinitions = defineTable({
	tenant: v.string(),
	key: v.string(),
	version: v.number(),
	kind: v.union(v.literal("report"), v.literal("questionnaire")),
	title: v.object({ ro: v.string(), en: v.string() }),
	/** `FormDefinition` as JSON (src/clinic/forms.ts). */
	definition: v.string(),
	status: v.union(v.literal("active"), v.literal("retired")),
	createdAt: v.number(),
	createdBy: v.string(),
}).index("by_tenant_key_version", ["tenant", "key", "version"]);

export const formResponses = defineTable({
	tenant: v.string(),
	definition: v.id("formDefinitions"),
	definitionKey: v.string(),
	definitionVersion: v.number(),
	/**
	 * Absent: a response that belongs to no client (an old-app report whose client was deleted there, kept with its
	 * visit). Only the app-wide clinical scope reaches it; no client's page, grant or own/assigned scope does.
	 */
	client: v.optional(v.id("clients")),
	visit: v.optional(v.id("visits")),
	practitioner: v.optional(v.id("practitioners")),
	/** The answers, as JSON, encrypted whole. */
	payload: encryptedValidator,
	createdAt: v.number(),
	updatedAt: v.number(),
	createdBy: v.string(),
	legacyId: v.optional(v.string()),
	fingerprint: v.optional(v.string()),
	version: v.number(),
})
	.index("by_tenant_client", ["tenant", "client", "createdAt"])
	.index("by_tenant_visit", ["tenant", "visit"])
	.index("by_tenant_definition", ["tenant", "definitionKey", "createdAt"])
	.index("by_tenant_legacy", ["tenant", "legacyId"]);

export const customFieldDefs = defineTable({
	tenant: v.string(),
	entity: v.union(
		v.literal("client"),
		v.literal("appointment"),
		v.literal("package"),
		v.literal("staff"),
	),
	key: v.string(),
	group: v.string(),
	active: v.boolean(),
	/** `CustomField` as JSON. */
	definition: v.string(),
	updatedAt: v.number(),
	updatedBy: v.string(),
}).index("by_tenant_entity_key", ["tenant", "entity", "key"]);

/** One value of a custom field on one entity. Clinical-group values are `enc`, the rest `plain` (JSON). */
export const customValues = defineTable({
	tenant: v.string(),
	entity: v.string(),
	entityId: v.string(),
	fieldKey: v.string(),
	group: v.string(),
	plain: v.optional(v.string()),
	enc: v.optional(encryptedValidator),
	updatedAt: v.number(),
}).index("by_tenant_entity", ["tenant", "entity", "entityId"]);

/** Views and actions the app's owners built (JSON validated by `viewDefinitionSchema` / `actionDefinitionSchema`). */
export const builderDefs = defineTable({
	tenant: v.string(),
	kind: v.union(v.literal("view"), v.literal("action")),
	key: v.string(),
	version: v.number(),
	json: v.string(),
	active: v.boolean(),
	updatedAt: v.number(),
	updatedBy: v.string(),
}).index("by_tenant_kind_key", ["tenant", "kind", "key", "version"]);

/** File metadata (client files and the notice board). The bytes are in object storage, encrypted. */
export const files = defineTable({
	tenant: v.string(),
	kind: fileKindValidator,
	client: v.optional(v.id("clients")),
	/** The notice's title, for the board. */
	title: v.optional(v.string()),
	fileName: v.string(),
	storageKey: v.string(),
	sha256: v.string(),
	sizeBytes: v.number(),
	contentType: v.string(),
	uploadedBy: v.string(),
	/** The data key version and IV the bytes were encrypted with. */
	encryption: v.object({ keyVersion: v.number(), iv: v.string() }),
	/** An upload the API signed but nobody finished is `pending`; absent means ready (the import's files). */
	status: v.optional(v.union(v.literal("pending"), v.literal("ready"))),
	completedAt: v.optional(v.number()),
	createdAt: v.number(),
	legacyId: v.optional(v.string()),
	fingerprint: v.optional(v.string()),
	version: v.number(),
})
	.index("by_tenant_client", ["tenant", "client"])
	.index("by_tenant_kind", ["tenant", "kind", "createdAt"])
	.index("by_tenant_legacy", ["tenant", "legacyId"]);

/** What happened, by whom, to what. The summary never holds clinical content (src/clinic/audit.ts). */
export const auditEvents = defineTable({
	tenant: v.string(),
	at: v.number(),
	actor: v.string(),
	action: v.string(),
	entity: v.string(),
	entityId: v.string(),
	summary: v.string(),
	/** A team change's before and after, the one place values are kept (src/clinic/audit-changes.ts). */
	changes: v.optional(v.array(v.object({ field: v.string(), from: v.string(), to: v.string() }))),
})
	.index("by_tenant_at", ["tenant", "at"])
	.index("by_tenant_entity", ["tenant", "entity", "entityId", "at"]);

/** Object-storage keys whose bytes must be deleted (an erased client's files); the service drains it. */
export const storageOutbox = defineTable({
	tenant: v.string(),
	storageKey: v.string(),
	reason: v.literal("erasure"),
	createdAt: v.number(),
}).index("by_tenant_created", ["tenant", "createdAt"]);

/** The live change feed: what changed, never its content. Kept 7 days (`changes.purge`). */
export const changeLog = defineTable({
	tenant: v.string(),
	kind: v.string(),
	entityId: v.string(),
	at: v.number(),
	version: v.number(),
})
	.index("by_tenant", ["tenant"])
	.index("by_at", ["at"]);
