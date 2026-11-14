import { encryptedSchema } from "@psi/scheduling/crypto";
import { z } from "zod";
import type { KeyStore } from "../../ports/crypto";
import type { Rpc } from "./rpc";

/**
 * An app's data keys, wrapped by the master key, in Convex (`apiKeys`): the same rows the import writes. Convex returns
 * them and stores new ones; it can neither wrap nor unwrap one.
 */
const Wrapped = z.array(z.object({ version: z.number(), wrapped: encryptedSchema }));
const Installed = z.enum(["installed", "exists"]);

export function keyStore(rpc: Rpc): KeyStore {
	return {
		async keys(app) {
			return (await rpc.query("apiKeys:wrapped", { tenant: app }, Wrapped)).map((k) => k.wrapped);
		},
		async install(app, version, wrapped) {
			await rpc.mutation("apiKeys:install", { tenant: app, version, wrapped }, Installed);
		},
	};
}
