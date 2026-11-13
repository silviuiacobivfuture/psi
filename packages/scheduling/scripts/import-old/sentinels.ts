import { mappingSchema } from "./mapping";

/** Synthetic sentinels and the mapping the import tests use. */
export const SENTINELS = {
	diagnosis: "SENTINEL-DIAGNOSIS",
	notes: "SENTINEL-HEALTH-NOTES",
	reason: "SENTINEL-MAIN-REASON",
	therapistNote: "SENTINEL-THERAPIST-NOTE",
	feedback: "SENTINEL-PARENT-FEEDBACK",
	visitNote: "SENTINEL-VISIT-NOTE",
	name: "Test Client A",
	phone: "0700 000 001",
	fileBytes: "SENTINEL-FILE-BYTES",
} as const;

export const MAPPING = mappingSchema.parse({
	app: "psizone",
	appName: "Psizone",
	appKind: "clinic",
	address: "Test address 1",
	resources: [
		{ slug: "nfb-1", name: "NFB 1", kind: "device" },
		{ slug: "nfb-2", name: "NFB 2", kind: "device" },
		{ slug: "cabinet-1", name: "Cabinet 1", kind: "room", roomKind: "therapy" },
		{ slug: "cabinet-grup", name: "Cabinet Grup", kind: "room", roomKind: "group", capacity: 8 },
	],
	roomIds: { "1": "nfb-1", "2": "nfb-2", "3": "cabinet-1" },
	therapistResources: { "7": "nfb-1", "8": "nfb-2", "9": "cabinet-grup" },
	groupActivityColumns: [10, 11, 12, 13, 14],
	staff: [
		{ legacyId: 101, name: "Test Reception", kind: "reception" },
		{ legacyId: 102, name: "Test Other", kind: "other" },
	],
});
