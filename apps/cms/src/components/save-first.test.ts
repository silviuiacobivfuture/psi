import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AnalyticsDaily } from "../collections/analytics-daily";
import { Articles } from "../collections/articles";
import { KnowledgeEntries } from "../collections/knowledge-entries";
import { Media } from "../collections/media";
import { Offerings } from "../collections/offerings";
import { People } from "../collections/people";
import { ReviewEvents } from "../collections/review-events";
import { Users } from "../collections/users";
import { reviewedEditButtons } from "../review/fields";
import { documentActions, type SaveFirstSteps, saveFirst } from "./save-first";

/** The steps as a log: what ran, in order, and what each answered. */
function recorder(modified: boolean, draftStored: boolean) {
	const log: string[] = [];
	const steps: SaveFirstSteps = {
		modified,
		async saveDraft() {
			log.push("saveDraft");
			return draftStored;
		},
		async act() {
			log.push("act");
		},
	};
	return { log, steps };
}

describe("an action on a reviewed document saves the text on the screen first", () => {
	it("with unsaved changes: the draft is stored, then the action runs on it", async () => {
		const { log, steps } = recorder(true, true);
		expect(await saveFirst(steps)).toBe("saved-then-acted");
		expect(log).toEqual(["saveDraft", "act"]);
	});

	it("a refused draft save stops there: the action never runs, the text stays unsaved", async () => {
		const { log, steps } = recorder(true, false);
		expect(await saveFirst(steps)).toBe("kept-unsaved");
		expect(log).toEqual(["saveDraft"]);
	});

	it("with nothing unsaved: the action runs alone, no draft is written", async () => {
		const { log, steps } = recorder(false, true);
		expect(await saveFirst(steps)).toBe("acted");
		expect(log).toEqual(["act"]);
	});

	it("an action that fails is not hidden, after the draft was stored", async () => {
		const log: string[] = [];
		const failing = saveFirst({
			modified: true,
			async saveDraft() {
				log.push("saveDraft");
				return true;
			},
			async act() {
				log.push("act");
				throw new Error("refused");
			},
		});
		await expect(failing).rejects.toThrow("refused");
		expect(log).toEqual(["saveDraft", "act"]);
	});
});

describe("the document's REST addresses are the ones Payload's own buttons use", () => {
	const a = documentActions("/api", "articles", 414, "ro");

	it("draft: the edited locale, no fallback, draft=true (Save draft)", () => {
		expect(a.draft).toBe("/api/articles/414?locale=ro&depth=0&fallback-locale=null&draft=true");
	});

	it("publish: every locale, from the edited one, never draft", () => {
		expect(a.publish).toBe("/api/articles/414?depth=0&locale=ro");
		expect(a.publish).not.toContain("draft");
	});

	it("publish one locale: that locale only", () => {
		expect(a.publishLocale("en")).toBe(
			"/api/articles/414?depth=0&locale=en&publishSpecificLocale=en",
		);
	});

	it("follow the configured API route and encode the id", () => {
		const b = documentActions("/cms-api", "knowledge-entries", "a b/1", "en");
		expect(b.draft).toBe(
			"/cms-api/knowledge-entries/a%20b%2F1?locale=en&depth=0&fallback-locale=null&draft=true",
		);
	});
});

describe("every reviewed collection publishes through the save-first button", () => {
	const REVIEWED = [Articles, KnowledgeEntries, Offerings];
	const OTHERS = [Users, People, Media, ReviewEvents, AnalyticsDaily];
	const path = reviewedEditButtons.PublishButton;

	it.each(REVIEWED.map((c) => [c.slug, c] as const))("%s registers it", (_slug, c) => {
		expect(c.admin?.components?.edit?.PublishButton).toBe(path);
	});

	it.each(OTHERS.map((c) => [c.slug, c] as const))("%s keeps Payload's own", (_slug, c) => {
		expect(c.admin?.components?.edit?.PublishButton).toBeUndefined();
	});

	it("is in the admin's import map, so the edit view can render it", () => {
		const map = readFileSync(
			fileURLToPath(new URL("../app/(payload)/admin/importMap.js", import.meta.url)),
			"utf8",
		);
		expect(map).toContain(`"${path}"`);
		expect(map).toMatch(
			/import \{ PublishAfterSave as \w+ \} from ["']\.\.\/\.\.\/\.\.\/components\/PublishAfterSave["']/,
		);
	});
});
