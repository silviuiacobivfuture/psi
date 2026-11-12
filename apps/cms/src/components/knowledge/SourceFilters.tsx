"use client";
import { useTranslation } from "@payloadcms/ui";
import { live } from "@psi/content/retired";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";
import type { CustomKey } from "../../i18n";
import { SOURCE_LANGUAGES, SOURCE_STATUSES } from "../../knowledge/source-doc";

/**
 * Quick filters above the sources list: status and language (the brand comes from the admin's
 * brand filter, and the full filter builder stays available). Each is a link that sets Payload's
 * own `where` query, so the list, its counts and its pagination stay Payload's.
 */
const BRANDS = live(["psizone", "eqsync", "hemisync", "blog"] as const);
const Status = z.enum(SOURCE_STATUSES);

function href(path: string, params: URLSearchParams, field: string, value: string | null): string {
	const next = new URLSearchParams(params);
	next.delete(`where[${field}][equals]`);
	next.delete("page");
	if (value !== null) next.set(`where[${field}][equals]`, value);
	const q = next.toString();
	return q === "" ? path : `${path}?${q}`;
}

function Row({
	label,
	field,
	values,
	word,
}: {
	label: string;
	field: string;
	values: ReadonlyArray<string>;
	word: (v: string) => string;
}): ReactElement {
	const path = usePathname();
	const params = useSearchParams();
	const current = params.get(`where[${field}][equals]`);
	const { t } = useTranslation<object, CustomKey>();
	const link = (value: string | null, text: string): ReactElement => (
		<a
			key={value ?? "all"}
			href={href(path, new URLSearchParams(params.toString()), field, value)}
			aria-current={current === value ? "true" : undefined}
			style={{
				padding: "2px 10px",
				borderRadius: 999,
				border: "1px solid var(--theme-elevation-150)",
				textDecoration: "none",
				fontWeight: current === value ? 700 : 400,
				background: current === value ? "var(--theme-elevation-100)" : "transparent",
			}}
		>
			{text}
		</a>
	);
	return (
		<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
			<span style={{ minWidth: 70, color: "var(--theme-elevation-600)" }}>{label}</span>
			{link(null, t("psi:ksFilterAll"))}
			{values.map((v) => link(v, word(v)))}
		</div>
	);
}

export function SourceFilters(): ReactElement {
	const { t } = useTranslation<object, CustomKey>();
	return (
		<div style={{ display: "grid", gap: 8, margin: "var(--base) 0" }}>
			<Row
				label={t("psi:ksFilterStatus")}
				field="status"
				values={SOURCE_STATUSES.filter((s) => s !== "extracting")}
				word={(v) => t(`psi:ksStatus_${Status.catch("uploaded").parse(v)}`)}
			/>
			<Row
				label={t("psi:ksFilterLanguage")}
				field="language"
				values={SOURCE_LANGUAGES}
				word={(v) => v}
			/>
			<Row label={t("psi:ksFilterBrand")} field="brand" values={BRANDS} word={(v) => v} />
		</div>
	);
}
