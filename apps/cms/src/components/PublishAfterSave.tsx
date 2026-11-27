"use client";
import { getTranslation } from "@payloadcms/translations";
import {
	FormSubmit,
	PopupList,
	useDocumentInfo,
	useEditDepth,
	useForm,
	useFormModified,
	useHotkey,
	useLocale,
	useTranslation,
} from "@payloadcms/ui";
import { type ReactElement, useCallback } from "react";
import { useSaveFirst } from "./use-save-first";

/**
 * The edit view's Publish button for the reviewed collections (admin.components.edit.PublishButton).
 * Payload's own one publishes the form as it is; when the review gate refuses (a text not yet
 * approved, a missing field) the form is left unmodified and autosave never stores what was typed,
 * so the person's edit vanished at the next reload. This one saves the text as a draft first and
 * then publishes it (save-first.ts): a refused publish leaves the edit stored, and the gate's
 * message says why it is not live yet. Otherwise it is Payload's: same label, same rule for when it
 * is enabled, Ctrl/⌘+S saves the draft, and "publish in this language" stays in its menu.
 */
export function PublishAfterSave(): ReactElement | null {
	const {
		hasPublishedDoc,
		hasPublishPermission,
		setHasPublishedDoc,
		setMostRecentVersionIsAutosaved,
		setUnpublishedVersionCount,
		unpublishedVersionCount,
		uploadStatus,
	} = useDocumentInfo();
	const { submit } = useForm();
	const modified = useFormModified();
	const editDepth = useEditDepth();
	const locale = useLocale();
	const { i18n, t } = useTranslation();
	const { actions, saveDraft, run } = useSaveFirst();

	const publishTo = useCallback(
		(action: string): Promise<void> =>
			run(async () => {
				const result = await submit({
					action,
					method: "PATCH",
					overrides: { _status: "published" },
				});
				if (result?.res.ok !== true) return;
				setUnpublishedVersionCount(0);
				setMostRecentVersionIsAutosaved(false);
				setHasPublishedDoc(true);
			}).then(() => undefined),
		[run, submit, setHasPublishedDoc, setMostRecentVersionIsAutosaved, setUnpublishedVersionCount],
	);

	useHotkey({ cmdCtrlKey: true, editDepth, keyCodes: ["s"] }, (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (modified) void saveDraft();
	});

	if (!hasPublishPermission || actions === null) return null;
	const canPublish =
		(modified || unpublishedVersionCount > 0 || !hasPublishedDoc) && uploadStatus !== "uploading";
	const localeLabel = getTranslation(locale.label, i18n);
	return (
		<FormSubmit
			buttonId="action-save"
			disabled={!canPublish}
			onClick={() => void publishTo(actions.publish)}
			size="medium"
			enableSubMenu
			SubMenuPopupContent={({ close }) => (
				<PopupList.ButtonGroup>
					<PopupList.Button
						id="publish-locale"
						onClick={() => {
							close();
							void publishTo(actions.publishLocale(locale.code));
						}}
					>
						{t("version:publishIn", { locale: localeLabel })}
					</PopupList.Button>
				</PopupList.ButtonGroup>
			)}
		>
			{t("version:publishChanges")}
		</FormSubmit>
	);
}
