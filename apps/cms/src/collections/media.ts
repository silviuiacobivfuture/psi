import type { CollectionConfig } from "payload";
import { signedIn } from "./access";

/** Images and files, stored in the estate's object storage (see payload.config.ts). */
export const Media: CollectionConfig = {
	slug: "media",
	labels: { singular: { ro: "Fișier", en: "File" }, plural: { ro: "Fișiere", en: "Files" } },
	access: { read: () => true, create: signedIn, update: signedIn, delete: signedIn },
	upload: { mimeTypes: ["image/*", "application/pdf"] },
	fields: [
		{
			name: "alt",
			type: "text",
			localized: true,
			required: true,
			label: { ro: "Text alternativ", en: "Alt text" },
		},
	],
};
