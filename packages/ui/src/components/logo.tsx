/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { live, RETIRED_SITES } from "@psi/content/retired";
import { MARK_ATTRS, MARKS, type MarkBrand } from "@psi/design/logos";
import { raw } from "hono/html";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export type Brand = "auto" | MarkBrand;

export interface LogoProps {
	size?: number;
	brand?: Brand;
	variant?: "lockup" | "mark";
	href?: string;
	class?: string;
	/**
	 * "by Psizone" / "de la Psizone", in the page's language: the sister brands' endorsement line.
	 * Shown under the wordmark of EQ-SYNC, Hemi-Sync and the Blog, never on Psizone's own.
	 */
	endorsement?: string;
	/** The retired sites, left out of `brand="auto"`; `RETIRED_SITES` unless a test says otherwise. */
	retired?: ReadonlyArray<string>;
}

/** The smallest size that carries the full emblem (its hairlines need room); below it the compact cut keeps its strokes whole. */
const FULL_FROM = 48;

const ARIA: Readonly<Record<MarkBrand, string>> = {
	psizone: "Psizone",
	eqsync: "EQ-SYNC",
	hemisync: "Hemi-Sync România",
	blog: "Blog",
};

function Mark({ brand, size }: { brand: MarkBrand; size: number }): JSX.Element {
	const cut = size >= FULL_FROM ? "full" : "compact";
	return (
		<svg
			{...MARK_ATTRS}
			class="pz-logo__mark"
			width={size}
			height={size}
			aria-hidden="true"
			focusable="false"
		>
			{raw(MARKS[brand][cut])}
		</svg>
	);
}

function Endorsement({ text, size }: { text: string; size: number }): JSX.Element {
	return (
		<span class="pz-logo__by">
			<Mark brand="psizone" size={Math.max(12, Math.round(size * 0.4))} />
			<span>{text}</span>
		</span>
	);
}

/** One brand's lockup: its mark, its wordmark, and (sister brands only) the endorsement line. */
function Lockup({
	brand,
	size,
	word,
	endorsement,
}: {
	brand: MarkBrand;
	size: number;
	word: boolean;
	endorsement: string | undefined;
}): JSX.Element {
	const small = `${Math.round(size * 0.6)}px`;
	const by =
		word && endorsement !== undefined && brand !== "psizone" ? (
			<Endorsement text={endorsement} size={size} />
		) : null;
	return (
		<span
			class={`pz-logo__brand pz-logo__brand--${brand}`}
			role="img"
			aria-label={ARIA[brand]}
			style={brand === "psizone" ? undefined : { fontSize: small }}
		>
			<Mark brand={brand} size={size} />
			{word ? (
				<span class="pz-logo__stack">
					{brand === "psizone" ? (
						<span class="pz-logo__word" style={{ fontSize: `${Math.round(size * 0.78)}px` }}>
							psizone
						</span>
					) : brand === "eqsync" ? (
						<span class="pz-logo__eq">
							EQ-SYNC<b>.</b>
						</span>
					) : brand === "hemisync" ? (
						<span class="pz-logo__hs">
							Hemi-Sync<small>România</small>
						</span>
					) : (
						<span class="pz-logo__blog">Blog</span>
					)}
					{by}
				</span>
			) : null}
		</span>
	);
}

const ALL: ReadonlyArray<MarkBrand> = ["psizone", "eqsync", "hemisync", "blog"];

/**
 * The current theme's brand (brand="auto": every brand is rendered and the theme shows its own),
 * or the one named. A retired site (`RETIRED_SITES`) is not among the auto brands. The marks are one family: Psizone's emblem and its sisters in the same frame.
 */
export function Logo({
	size = 32,
	brand = "auto",
	variant = "lockup",
	href,
	class: className,
	endorsement,
	retired = RETIRED_SITES,
}: LogoProps): JSX.Element {
	const brands = brand === "auto" ? live(ALL, retired) : [brand];
	const inner = brands.map((b) => (
		<Lockup brand={b} size={size} word={variant !== "mark"} endorsement={endorsement} />
	));
	const cls = cx("pz-logo", `pz-logo--${brand}`, className);
	return href ? (
		<a class={cls} href={href}>
			{inner}
		</a>
	) : (
		<span class={cls}>{inner}</span>
	);
}
