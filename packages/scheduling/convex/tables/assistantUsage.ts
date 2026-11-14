import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The assistants' meters of an app: one row per surface, period (`2026-11`, `2026-11-14` in the app's zone) and whose it
 * is (`org`, or a person's subject for their own day). Only ever incremented, in one transaction per turn.
 */
export const assistantUsage = defineTable({
	tenant: v.string(),
	surface: v.union(v.literal("staff"), v.literal("visitor")),
	period: v.string(),
	scope: v.string(),
	messages: v.number(),
	inputTokens: v.number(),
	outputTokens: v.number(),
	cachedTokens: v.number(),
	costMicroUsd: v.number(),
	limitHits: v.number(),
}).index("by_key", ["tenant", "surface", "period", "scope"]);
