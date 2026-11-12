"use client";
import { useTranslation } from "@payloadcms/ui";
import type { ReactElement } from "react";
import { z } from "zod";
import type { CustomKey } from "../../i18n";
import { SOURCE_STATUSES, type SourceStatus } from "../../knowledge/source-doc";

/** A source's status as a chip: a dot and a word (never colour alone), in the admin's language. */
const TONE: Readonly<Record<SourceStatus, string>> = {
	uploaded: "var(--theme-elevation-400)",
	awaiting_approval: "var(--theme-warning-500)",
	extracting: "var(--theme-elevation-500)",
	chunked: "var(--theme-elevation-500)",
	embedding: "var(--theme-elevation-500)",
	indexed: "var(--theme-success-500)",
	indexed_lexical: "var(--theme-warning-500)",
	private: "var(--theme-elevation-400)",
	rejected: "var(--theme-error-500)",
	removed: "var(--theme-elevation-400)",
	failed: "var(--theme-error-500)",
};

const Status = z.enum(SOURCE_STATUSES);

export function StatusChip({ status }: { status: unknown }): ReactElement {
	const { t } = useTranslation<object, CustomKey>();
	const s = Status.catch("uploaded").parse(status);
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				padding: "2px 8px",
				borderRadius: 999,
				border: "1px solid var(--theme-elevation-150)",
				whiteSpace: "nowrap",
				fontSize: "0.85em",
			}}
		>
			<span
				aria-hidden="true"
				style={{ width: 8, height: 8, borderRadius: 4, background: TONE[s] }}
			/>
			{t(`psi:ksStatus_${s}`)}
		</span>
	);
}

export function StatusCell({ cellData }: { cellData?: unknown }): ReactElement {
	return <StatusChip status={cellData} />;
}
