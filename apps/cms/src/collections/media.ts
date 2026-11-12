import type { CollectionConfig } from "payload";
import { manageMedia } from "../authz/access";

/**
 * Images and files. In the estate they live in object storage (payload.config.ts, S3_*); on a
 * workstation without S3 they are written to apps/cms/media (gitignored). Read is public: what is
 * uploaded is published on the sites.
 */
export const Media: CollectionConfig = {
	slug: "media",
	labels: { singular: { ro: "Fișier", en: "File" }, plural: { ro: "Fișiere", en: "Files" } },
	access: { read: () => true, create: manageMedia, update: manageMedia, delete: manageMedia },
	upload: {
		mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/avif", "application/pdf"],
		focalPoint: true,
		imageSizes: [
			{ name: "thumb", width: 400 },
			{ name: "card", width: 768 },
			{ name: "hero", width: 1600 },
		],
		adminThumbnail: "thumb",
	},
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
