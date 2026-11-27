"use client";
import { useConfig, useDocumentInfo, useForm, useFormModified, useLocale } from "@payloadcms/ui";
import { useCallback } from "react";
import {
	type DocumentActions,
	documentActions,
	type SaveFirstOutcome,
	saveFirst,
} from "./save-first";

export interface SaveFirst {
	/** This document's REST addresses; null before it exists (autosaved collections create it on open). */
	actions: DocumentActions | null;
	/** Stores the form as a draft; true once the server stored it. */
	saveDraft(): Promise<boolean>;
	/** Runs `act` on the stored text: the form is saved as a draft first when it holds changes. */
	run(act: () => Promise<void>): Promise<SaveFirstOutcome>;
}

/** The edit form's draft save and the save-first rule (save-first.ts), for a reviewed document. */
export function useSaveFirst(): SaveFirst {
	const { config } = useConfig();
	const { id, collectionSlug, setUnpublishedVersionCount } = useDocumentInfo();
	const { code: locale } = useLocale();
	const { submit } = useForm();
	const modified = useFormModified();
	const actions =
		id === undefined || id === null || collectionSlug === undefined
			? null
			: documentActions(config.routes.api, collectionSlug, id, locale);
	const draft = actions?.draft ?? null;

	const saveDraft = useCallback(async (): Promise<boolean> => {
		if (draft === null) return false;
		const result = await submit({
			action: draft,
			method: "PATCH",
			overrides: { _status: "draft" },
			skipValidation: true,
			disableSuccessStatus: true,
		});
		const stored = result?.res.ok === true;
		if (stored) setUnpublishedVersionCount((n) => n + 1);
		return stored;
	}, [draft, submit, setUnpublishedVersionCount]);

	const run = useCallback(
		(act: () => Promise<void>): Promise<SaveFirstOutcome> =>
			saveFirst({ modified, saveDraft, act }),
		[modified, saveDraft],
	);
	return { actions, saveDraft, run };
}
