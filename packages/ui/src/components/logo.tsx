/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export type Brand = "auto" | "psizone" | "eqsync" | "hemisync";

export interface LogoProps {
	size?: number;
	brand?: Brand;
	variant?: "lockup" | "mark";
	href?: string;
	class?: string;
}

/** The gradient orb: a placeholder for Psizone's mark until the real file arrives. */
function Mark({ size, id }: { size: number; id: string }): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
			<defs>
				<radialGradient id={id} cx="28%" cy="22%" r="90%">
					<stop offset="0" stop-color="var(--glow-3)" />
					<stop offset=".48" stop-color="var(--glow-2)" />
					<stop offset="1" stop-color="var(--glow-1)" />
				</radialGradient>
			</defs>
			<circle cx="32" cy="32" r="30" fill={`url(#${id})`} />
		</svg>
	);
}

/** The current theme's brand (brand="auto"), or the one named. All three marks are placeholders. */
export function Logo({
	size = 32,
	brand = "auto",
	variant = "lockup",
	href,
	class: className,
}: LogoProps): JSX.Element {
	const word = variant !== "mark";
	const small = `${Math.round(size * 0.6)}px`;
	const inner = (
		<>
			<span class="pz-logo__brand pz-logo__brand--psizone" role="img" aria-label="Psizone">
				<Mark size={size} id={`pz-mark-${size}`} />
				{word ? (
					<span class="pz-logo__word" style={{ fontSize: `${Math.round(size * 0.78)}px` }}>
						psizone
					</span>
				) : null}
			</span>
			<span
				class="pz-logo__brand pz-logo__brand--eqsync"
				role="img"
				aria-label="EQ-SYNC"
				style={{ fontSize: small }}
			>
				<span class="pz-logo__eq">
					EQ-SYNC<b>.</b>
				</span>
			</span>
			<span
				class="pz-logo__brand pz-logo__brand--hemisync"
				role="img"
				aria-label="Hemi-Sync România"
				style={{ fontSize: small }}
			>
				<span class="pz-logo__hs">
					Hemi-Sync<small>România</small>
				</span>
			</span>
		</>
	);
	const cls = cx("pz-logo", `pz-logo--${brand}`, className);
	return href ? (
		<a class={cls} href={href}>
			{inner}
		</a>
	) : (
		<span class={cls}>{inner}</span>
	);
}
