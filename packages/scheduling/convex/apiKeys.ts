import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { installWrappedKey, wrappedKeysOf } from "./clinicKeys";
import { requireServer } from "./guard";
import { encryptedValidator, serverKeyValidator } from "./validators";

/**
 * An app's data keys for the staff service, the same ones the import wrote with: ONE envelope for clinical text. They
 * travel WRAPPED by the master key (`CLINIC_MASTER_KEY`, which lives with the service and never here): Convex can neither
 * wrap nor unwrap one, so what these return is of no use without it.
 */
export const wrapped = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	returns: v.array(v.object({ version: v.number(), wrapped: encryptedValidator })),
	handler: async (ctx, args) => {
		requireServer(args.key);
		return wrappedKeysOf(ctx, args.tenant);
	},
});

/** The first data key of an app that has none, made by the service; a version that exists is never replaced. */
export const install = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		version: v.number(),
		wrapped: encryptedValidator,
	},
	returns: v.union(v.literal("installed"), v.literal("exists")),
	handler: async (ctx, args) => {
		requireServer(args.key);
		return installWrappedKey(ctx, {
			tenant: args.tenant,
			version: args.version,
			wrapped: args.wrapped,
		});
	},
});
