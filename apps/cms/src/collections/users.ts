import type { CollectionConfig } from "payload";
import { adminAnywhere, mayEnterAdmin, serverOnly, usersRead } from "../authz/access";

/**
 * The people who use the CMS: signed in through the directory (a local password is break-glass),
 * plus one service user per site holding a read-only API key. No role and no permission field:
 * the estate's authorization decides. Only an `admin` may create, change or remove a row (the
 * upstream rule let any signed-in person create a password account).
 */
export const Users: CollectionConfig = {
	slug: "users",
	labels: {
		singular: { ro: "Utilizator", en: "User" },
		plural: { ro: "Utilizatori", en: "Users" },
	},
	auth: { useSessions: true, useAPIKey: true },
	admin: { useAsTitle: "email", defaultColumns: ["email", "name", "directoryGroups"] },
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
	],
};
