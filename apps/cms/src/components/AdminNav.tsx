"use client";
import { useTranslation } from "@payloadcms/ui";
import type { ReactElement } from "react";
import type { CustomKey } from "../i18n";

const BRANDS = ["psizone", "eqsync", "hemisync", "blog"] as const;
const COOKIE = "psi-cms-brand";

function current(): string {
	if (typeof document === "undefined") return "";
	const hit = document.cookie
		.split(";")
		.map((c) => c.trim())
		.find((c) => c.startsWith(`${COOKIE}=`));
	return hit?.slice(COOKIE.length + 1) ?? "";
}

/**
 * Above the collections in the admin's navigation: the brand filter (one admin for the four
 * sites; lists narrow to the chosen brand) and the review queue and reading dashboard. What a
 * person may see at all is still the access rule, never this filter.
 */
export function AdminNav(): ReactElement {
	const { t } = useTranslation<object, CustomKey>();
	const choose = (brand: string): void => {
		// biome-ignore lint/suspicious/noDocumentCookie: a plain preference the server reads on the next request; the Cookie Store API is not in every browser the editors use.
		document.cookie =
			brand === ""
				? `${COOKIE}=; path=/; max-age=0; samesite=lax`
				: `${COOKIE}=${brand}; path=/; max-age=31536000; samesite=lax`;
		window.location.reload();
	};
	return (
		<div style={{ display: "grid", gap: "calc(var(--base) / 2)", marginBottom: "var(--base)" }}>
			<label style={{ display: "grid", gap: 4, fontSize: "0.85em" }}>
				{t("psi:brandFilter")}
				<select defaultValue={current()} onChange={(e) => choose(e.target.value)}>
					<option value="">{t("psi:brandAll")}</option>
					{BRANDS.map((b) => (
						<option key={b} value={b}>
							{b}
						</option>
					))}
				</select>
			</label>
			<a className="nav__link" href="/admin/review">
				{t("psi:navReview")}
			</a>
			<a className="nav__link" href="/admin/analytics">
				{t("psi:navAnalytics")}
			</a>
		</div>
	);
}
