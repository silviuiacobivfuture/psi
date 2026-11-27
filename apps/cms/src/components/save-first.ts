import { formatAdminURL } from "payload/shared";

/**
 * What a workflow action (publish, submit for review, approve, reject) does with the text still on
 * the screen. Payload marks a form unmodified after ANY submit, a refused one included, and its
 * autosave only saves a modified form: a publish the review gate refuses (400, "nu se poate
 * publica") therefore dropped every keystroke since the last autosave, without a word, and a
 * review action reloaded the page over them. So the text is saved as a draft FIRST, and the action
 * runs only once that draft is stored; a refused draft save stops there, the text kept on screen
 * and still modified (Payload re-marks a refused draft save as modified).
 */
export type SaveFirstOutcome = "acted" | "saved-then-acted" | "kept-unsaved";

export interface SaveFirstSteps {
	/** Whether the form holds changes not yet stored. */
	modified: boolean;
	/** Stores the form as a draft; true once the server stored it. */
	saveDraft(): Promise<boolean>;
	/** The action itself, on the stored draft. */
	act(): Promise<void>;
}

export async function saveFirst(steps: SaveFirstSteps): Promise<SaveFirstOutcome> {
	if (!steps.modified) {
		await steps.act();
		return "acted";
	}
	if (!(await steps.saveDraft())) return "kept-unsaved";
	await steps.act();
	return "saved-then-acted";
}

/** One document's REST addresses, as Payload's own Save draft and Publish buttons build them. */
export interface DocumentActions {
	/** Save the form as a draft of this document, in the locale being edited. */
	draft: string;
	/** Publish every locale. */
	publish: string;
	/** Publish the given locale only. */
	publishLocale(locale: string): string;
}

export function documentActions(
	apiRoute: string,
	collectionSlug: string,
	id: string | number,
	locale: string,
): DocumentActions {
	const at = (query: Record<string, string>): string =>
		formatAdminURL({
			apiRoute,
			path: `/${collectionSlug}/${encodeURIComponent(String(id))}?${new URLSearchParams(query)}`,
		});
	return {
		draft: at({ locale, depth: "0", "fallback-locale": "null", draft: "true" }),
		publish: at({ depth: "0", locale }),
		publishLocale: (l) => at({ depth: "0", locale: l, publishSpecificLocale: l }),
	};
}
