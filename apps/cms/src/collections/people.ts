import type { CollectionConfig } from "payload";
import { adminAnywhere, signedInOnly, writeAnywhere } from "../authz/access";

/**
 * Authors and clinical reviewers as the blog names them. A clinical reviewer's profile is linked
 * to their CMS account: their approval signs the article with this name and these credentials.
 */
export const People: CollectionConfig = {
	slug: "people",
	labels: { singular: { ro: "Persoană", en: "Person" }, plural: { ro: "Persoane", en: "People" } },
	admin: { useAsTitle: "name", defaultColumns: ["name", "credentials", "user"] },
	access: { read: () => true, create: writeAnywhere, update: writeAnywhere, delete: adminAnywhere },
	fields: [
		{ name: "name", type: "text", required: true, label: { ro: "Nume", en: "Name" } },
		{
			name: "credentials",
			type: "text",
			localized: true,
			required: true,
			label: { ro: "Titluri și calificări", en: "Credentials" },
		},
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			unique: true,
			label: { ro: "Contul din CMS (revizor)", en: "CMS account (reviewer)" },
			access: { read: signedInOnly },
		},
	],
};
