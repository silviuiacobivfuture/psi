import type { CollectionConfig } from "payload";
import { sessionSeconds } from "../auth/session-lifetime";
import { adminAnywhere, mayEnterAdmin, serverOnly, usersRead } from "../authz/access";

/**
 * The people who use the CMS: signed in through the directory (a local password is break-glass),
 * plus one service user per site holding a read-only API key. No role and no permission field:
 * the estate's authorization decides. Only an `admin` may create, change or remove a row (the
 * upstream rule let any signed-in person create a password account).
 *
 * A sign-in lasts the estate's SESSION_LIFETIME after its last use (`sessionLifetime`, from
 * auth/session-lifetime.ts: "never" = the 400 days a browser keeps a cookie, renewed at every use
 * by components/SessionKeeper.tsx). It ends when the person signs out, or when the directory
 * disables them (auth/directory-check.ts, through the hidden `directoryToken`).
 */
export function usersCollection(sessionLifetime: number): CollectionConfig {
	return {
		slug: "users",
		labels: {
			singular: { ro: "Utilizator", en: "User" },
			plural: { ro: "Utilizatori", en: "Users" },
		},
		auth: {
			useSessions: true,
			useAPIKey: true,
			tokenExpiration: sessionLifetime,
		},
		admin: {
			useAsTitle: "email",
			defaultColumns: ["email", "name", "directoryGroups"],
		},
		access: {
			admin: ({ req }) => mayEnterAdmin(req),
			read: usersRead,
			create: adminAnywhere,
			update: adminAnywhere,
			delete: adminAnywhere,
		},
		fields: [
			{ name: "name", type: "text", label: { ro: "Nume", en: "Name" } },
			{
				name: "directoryGroups",
				type: "text",
				hasMany: true,
				label: { ro: "Grupuri în director", en: "Directory groups" },
				access: serverOnly,
				admin: {
					readOnly: true,
					description: {
						ro: "Copiate din Authentik la fiecare intrare; nu se editează aici.",
						en: "Copied from Authentik at every sign-in; never edited here.",
					},
				},
			},
			{
				// The directory's refresh token from this person's last sign-in (offline_access). Never
				// shown, never returned by the API, never spent: only introspected, to learn that the
				// directory disabled the person (auth/directory-check.ts).
				name: "directoryToken",
				type: "text",
				hidden: true,
				access: { ...serverOnly, read: (): boolean => false },
			},
		],
	};
}

/** The collection with the default lifetime ("never"), for code that needs only its shape. */
export const Users: CollectionConfig = usersCollection(sessionSeconds(undefined));
