import { METRICS } from "@psi/cms-client";
import type { CollectionConfig } from "payload";
import { readByBrandField } from "../authz/scoped";
import { L } from "../labels";

/**
 * Reading counters: one row per day, article and metric, incremented by the blog's collector
 * through /api/analytics/ingest (never written from the admin). There is no column for a person,
 * an address, a device or a time of day: nothing here is personal data.
 */
export const AnalyticsDaily: CollectionConfig = {
	slug: "analytics-daily",
	labels: L.analytics,
	admin: {
		hidden: true,
		defaultColumns: ["day", "brand", "slug", "locale", "metric", "count"],
	},
	access: {
		read: readByBrandField,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	indexes: [{ fields: ["day", "brand", "slug", "locale", "topic", "metric"], unique: true }],
	fields: [
		{ name: "day", type: "text", required: true, index: true },
		{ name: "brand", type: "text", required: true, index: true },
		{ name: "slug", type: "text", required: true, defaultValue: "" },
		{ name: "locale", type: "text", required: true },
		{ name: "topic", type: "text", required: true, defaultValue: "" },
		{
			name: "metric",
			type: "select",
			required: true,
			options: METRICS.map((m) => ({ label: m, value: m })),
		},
		{ name: "count", type: "number", required: true, defaultValue: 0 },
	],
	timestamps: false,
};
