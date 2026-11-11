import type { CollectionConfig } from "payload";
import { signedIn } from "./access";

/** Authors and clinical reviewers named on health articles. */
export const People: CollectionConfig = {
	slug: "people",
	labels: { singular: { ro: "Persoană", en: "Person" }, plural: { ro: "Persoane", en: "People" } },
	admin: { useAsTitle: "name" },
	access: { read: () => true, create: signedIn, update: signedIn, delete: signedIn },
	fields: [
		{ name: "name", type: "text", required: true, label: { ro: "Nume", en: "Name" } },
		{
			name: "credentials",
			type: "text",
			localized: true,
			required: true,
			label: { ro: "Titluri și calificări", en: "Credentials" },
		},
	],
};
