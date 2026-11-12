"use client";
import { NavGroup, useTranslation } from "@payloadcms/ui";
import { type ReactElement, useEffect, useState } from "react";
import type { CustomKey } from "../i18n";

const BRANDS = ["psizone", "eqsync", "hemisync", "blog"] as const;
const COOKIE = "psi-cms-brand";

/**
 * The one "Platformă / Platform" group, in the owner's order. The collections and globals it
 * names (knowledge sources, knowledge, site settings, AI settings) set `admin.group: false`, so
 * each appears here once and Payload's routes for them stay as they are. Each page checks
 * access itself; a link is never a permission.
 */
const PLATFORM: ReadonlyArray<readonly [string, CustomKey]> = [
	["/admin/platform", "psi:navOverview"],
	["/admin/platform/ai", "psi:navAi"],
	["/admin/platform/ai/behaviour", "psi:navBehaviour"],
	["/admin/collections/knowledge-sources", "psi:ksNav"],
	["/admin/collections/knowledge-entries", "psi:navKnowledge"],
	["/admin/platform/scheduling", "psi:navScheduling"],
	["/admin/platform/accounts", "psi:navAccounts"],
	["/admin/platform/notifications", "psi:navNotifications"],
	["/admin/globals/site-settings", "psi:navSiteSettings"],
	["/admin/globals/ai-settings", "psi:navAiSettings"],
];

const BRAND_NAME: Readonly<Record<(typeof BRANDS)[number], CustomKey>> = {
	psizone: "psi:brandName_psizone",
	eqsync: "psi:brandName_eqsync",
	hemisync: "psi:brandName_hemisync",
	blog: "psi:brandName_blog",
};

function current(): string {
	if (typeof document === "undefined") return "";
	const hit = document.cookie
		.split(";")
		.map((c) => c.trim())
		.find((c) => c.startsWith(`${COOKIE}=`));
	return hit?.slice(COOKIE.length + 1) ?? "";
}

/** Pages with their own link beneath them: the parent's link is exact (one active link at a time). */
const EXACT = new Set(["/admin/platform", "/admin/platform/ai"]);

/** Whether this link is the page being shown (its own path, or a page beneath it). */
function isActive(href: string, path: string): boolean {
	return EXACT.has(href) ? path === href : path === href || path.startsWith(`${href}/`);
}

/**
 * Above the collections in the admin's navigation: the brand filter (one admin for the four
 * sites; lists narrow to the chosen brand), the review queue and reading dashboard, and the
 * control plane's group. What a person may see at all is still the access rule, never this filter.
 */
export function AdminNav(): ReactElement {
	const { t } = useTranslation<object, CustomKey>();
	// Read in the browser: the server render has neither the cookie nor the path.
	const [brand, setBrand] = useState("");
	const [path, setPath] = useState("");
	useEffect(() => {
		setBrand(current());
		setPath(window.location.pathname);
	}, []);
	const choose = (next: string): void => {
		// biome-ignore lint/suspicious/noDocumentCookie: a plain preference the server reads on the next request; the Cookie Store API is not in every browser the editors use.
		document.cookie =
			next === ""
				? `${COOKIE}=; path=/; max-age=0; samesite=lax`
				: `${COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
		window.location.reload();
	};
	return (
		<div style={{ display: "grid", gap: "calc(var(--base) / 2)", marginBottom: "var(--base)" }}>
			<label style={{ display: "grid", gap: 4, fontSize: "0.85em" }}>
				{t("psi:brandFilter")}
				<select value={brand} onChange={(e) => choose(e.target.value)}>
					<option value="">{t("psi:brandAll")}</option>
					{BRANDS.map((b) => (
						<option key={b} value={b}>
							{t(BRAND_NAME[b])}
						</option>
					))}
				</select>
			</label>
			<a className="nav__link" href="/admin/review">
				<span className="nav__link-label">{t("psi:navReview")}</span>
			</a>
			<a className="nav__link" href="/admin/analytics">
				<span className="nav__link-label">{t("psi:navAnalytics")}</span>
			</a>
			<NavGroup label={t("psi:navPlatform")} isOpen>
				{PLATFORM.map(([href, key]) => (
					<a
						key={href}
						className={`nav__link${isActive(href, path) ? " active" : ""}`}
						href={href}
						aria-current={isActive(href, path) ? "page" : undefined}
					>
						<span className="nav__link-label">{t(key)}</span>
					</a>
				))}
			</NavGroup>
		</div>
	);
}
