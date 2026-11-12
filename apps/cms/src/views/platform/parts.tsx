import type { ControlProblem, PartState } from "@psi/cms-client";
import type { AdminViewServerProps } from "payload";
import type { ReactElement, ReactNode } from "react";
import { z } from "zod";
import type { Brand } from "../../authz/types";
import { isPsiKey, type PsiKey } from "../../i18n";
import { cell } from "../shell";

/** The control plane's building blocks, in Payload's theme tokens (dark mode follows the admin). */
export type Say = (k: PsiKey) => string;

export const BRAND_NAMES: Readonly<Record<Brand, string>> = {
	psizone: "Psizone",
	eqsync: "EQ-SYNC",
	hemisync: "Hemi-Sync România",
	blog: "Blog",
};

export const muted = { color: "var(--theme-elevation-600)" } as const;
export const box = {
	border: "1px solid var(--theme-elevation-150)",
	borderRadius: 8,
	padding: "var(--base)",
	marginTop: "var(--base)",
} as const;

/** A query parameter as one string (Next hands arrays for repeats). */
export function param(props: AdminViewServerProps, key: string): string | undefined {
	const v = props.searchParams?.[key];
	return Array.isArray(v) ? v[0] : v;
}

/** One link per brand the person may use here; the current one is bold. */
export function BrandTabs({
	path,
	brands,
	brand,
	extra = "",
}: {
	path: string;
	brands: ReadonlyArray<Brand>;
	brand: Brand;
	extra?: string;
}): ReactElement {
	return (
		<nav style={{ display: "flex", gap: "var(--base)", flexWrap: "wrap", margin: "var(--base) 0" }}>
			{brands.map((b) => (
				<a
					key={b}
					href={`${path}?brand=${b}${extra}`}
					aria-current={b === brand ? "page" : undefined}
					style={{
						fontWeight: b === brand ? 700 : 400,
						textDecoration: b === brand ? "underline" : "none",
					}}
				>
					{BRAND_NAMES[b]}
				</a>
			))}
		</nav>
	);
}

/** Green: running. Amber: off or not configured (a choice, or a key still to set). Red: failing. */
const TONE: Readonly<Record<PartState | "warn", "on" | "warn" | "bad">> = {
	on: "on",
	off: "warn",
	not_configured: "warn",
	error: "bad",
	warn: "warn",
};

export function stateWord(say: Say, s: PartState): string {
	if (s === "on") return say("stateOn");
	if (s === "off") return say("stateOff");
	if (s === "error") return say("stateError");
	return say("notConfigured");
}

export function problemWord(say: Say, p: ControlProblem): string {
	const words: Readonly<Record<ControlProblem, PsiKey>> = {
		not_configured: "notConfigured",
		unreachable: "unreachable",
		refused: "refused",
		not_found: "notFound",
		invalid: "invalid",
	};
	return say(words[p]);
}

/** A dot and a word: never colour alone. */
export function Badge({
	state,
	label,
}: {
	state: PartState | "warn";
	label: string;
}): ReactElement {
	return (
		<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
			<span aria-hidden="true" className={`psi-dot psi-dot--${TONE[state]}`} />
			{label}
		</span>
	);
}

/** A small card: a label, a number, and a line under it. */
export function StatCard({
	label,
	value,
	note,
	href,
}: {
	label: string;
	value: string;
	note?: string;
	href?: string;
}): ReactElement {
	return (
		<div className="psi-card">
			<div className="psi-card__label">{label}</div>
			<div className="psi-card__value">
				{href === undefined ? value : <a href={href}>{value}</a>}
			</div>
			{note === undefined ? null : <div className="psi-card__note">{note}</div>}
		</div>
	);
}

export function Table({
	head,
	children,
}: {
	head: ReadonlyArray<string>;
	children: ReactNode;
}): ReactElement {
	return (
		<table
			style={{ width: "100%", borderCollapse: "collapse", marginTop: "calc(var(--base) / 2)" }}
		>
			<thead>
				<tr>
					{head.map((h) => (
						<th key={h} style={cell}>
							{h}
						</th>
					))}
				</tr>
			</thead>
			<tbody>{children}</tbody>
		</table>
	);
}

const FlashKey = z.string().regex(/^[a-zA-Z0-9_]{1,60}$/);

/**
 * The outcome of the last action, from the redirect's `?done=` or `?error=` (the endpoints answer
 * every form with 303 back to the view): a known message key, or the generic one.
 */
export function Flash({
	props,
	say,
}: {
	props: AdminViewServerProps;
	say: Say;
}): ReactElement | null {
	const done = FlashKey.safeParse(param(props, "done"));
	const error = FlashKey.safeParse(param(props, "error"));
	if (!done.success && !error.success) return null;
	const known = (k: string): string =>
		isPsiKey(k) ? say(k) : done.success ? say("done") : say("actionFailed");
	const ok = done.success;
	return (
		<p
			role="status"
			style={{
				...box,
				borderColor: ok ? "var(--theme-success-500)" : "var(--theme-error-500)",
			}}
		>
			{ok ? known(done.data) : `${say("actionFailed")}: ${known(error.success ? error.data : "")}`}
		</p>
	);
}

export const inputStyle = { padding: "4px 6px", minWidth: 80 } as const;
export const buttonStyle = { padding: "4px 10px", cursor: "pointer" } as const;

/** A stored code (a mode, a channel, a purpose) in the admin's language; unknown codes as they are. */
export function word(say: Say, prefix: string, code: string): string {
	const k = `${prefix}_${code}`;
	return isPsiKey(k) ? say(k) : code;
}
