import { describe, expect, it } from "vitest";
import { decide, type Existing, LEGACY_WINDOW_MS } from "./refresh";

const T0 = "2026-11-12T08:00:00.000Z";
const T1 = "2026-11-12T08:00:05.000Z";
const marked: Existing = {
	status: "draft",
	stage: "draft",
	authorUser: null,
	reviewStates: ["pending", "pending"],
	reviewEvents: 0,
	createdAt: T0,
	updatedAt: T1,
	versionAt: T1,
	marker: { hash: "h1", docAt: T1, versionAt: T1 },
};

describe("which existing articles an import may refresh", () => {
	it("creates what the CMS does not have", () => {
		expect(decide("h1", null)).toEqual({ action: "create" });
	});
	it("leaves an untouched, unchanged one alone", () => {
		expect(decide("h1", marked)).toEqual({ action: "skip", reason: "unchanged", why: [] });
	});
	it("refreshes an untouched one when the repository changed", () => {
		expect(decide("h2", marked)).toEqual({ action: "update" });
	});
	it.each([
		["published", { status: "published" }, "status published"],
		["in review", { stage: "in_review" }, "workflow in_review"],
		["approved", { stage: "approved" }, "workflow approved"],
		["created in the admin", { authorUser: 4 }, "written in the admin"],
		["has a review event", { reviewEvents: 2 }, "2 review event(s)"],
		["a locale reviewed", { reviewStates: ["pending", "approved"] }, "a locale was reviewed"],
		[
			"changes requested",
			{ reviewStates: ["changes_requested", "pending"] },
			"a locale was reviewed",
		],
		[
			"edited after the import",
			{ updatedAt: "2026-11-12T09:00:00.000Z" },
			"edited since the import",
		],
		[
			"a version saved after the import",
			{ versionAt: "2026-11-12T09:00:00.000Z" },
			"edited since the import",
		],
	] as const)("leaves alone, and says so: %s", (_n, patch, why) => {
		const d = decide("h2", { ...marked, ...patch });
		expect(d).toMatchObject({ action: "skip", reason: "edited" });
		expect(d.action === "skip" && d.why).toContain(why);
	});
	it("a person's edit wins even when the repository is unchanged", () => {
		expect(decide("h1", { ...marked, reviewEvents: 1 })).toMatchObject({ reason: "edited" });
	});
	it("an import from before markers: refreshed inside its own write window, left alone after", () => {
		const legacy: Existing = { ...marked, marker: null, updatedAt: T1, versionAt: T1 };
		expect(decide("h2", legacy)).toEqual({ action: "update" });
		const late = new Date(Date.parse(T0) + LEGACY_WINDOW_MS + 1).toISOString();
		expect(decide("h2", { ...legacy, updatedAt: late })).toMatchObject({ reason: "edited" });
		expect(decide("h2", { ...legacy, versionAt: late })).toMatchObject({ reason: "edited" });
		expect(decide("h2", { ...legacy, versionAt: null })).toEqual({ action: "update" });
	});
});
