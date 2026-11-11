import type { CollectionConfig } from "payload";
import { signedIn } from "./access";

/** The people who edit content. Signed in through the directory; a local password is break-glass. */
export const Users: CollectionConfig = {
	slug: "users",
	labels: {
		singular: { ro: "Utilizator", en: "User" },
		plural: { ro: "Utilizatori", en: "Users" },
	},
	auth: { useSessions: true },
	admin: { useAsTitle: "email", defaultColumns: ["email", "name"] },
	access: { read: signedIn, create: signedIn, update: signedIn, delete: signedIn },
	fields: [{ name: "name", type: "text", label: { ro: "Nume", en: "Name" } }],
};
