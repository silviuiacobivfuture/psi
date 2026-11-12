import type { ReactElement } from "react";

/**
 * psi's mark in the admin: the gradient orb of @psi/ui's Logo (a placeholder until the real mark
 * arrives; packages/design/component-guides/Logo.md), in Psizone's gold and teal. Server-rendered
 * SVG; never recoloured per theme beyond the tokens.
 */
export function PsiMark({ size, id }: { size: number; id: string }): ReactElement {
	return (
		<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
			<defs>
				<radialGradient id={id} cx="28%" cy="22%" r="90%">
					<stop offset="0" stopColor="#D9B25A" />
					<stop offset=".48" stopColor="#2FC8BA" />
					<stop offset="1" stopColor="#86650F" />
				</radialGradient>
			</defs>
			<circle cx="32" cy="32" r="30" fill={`url(#${id})`} />
		</svg>
	);
}

/** Payload's `admin.components.graphics.Icon`: the mark alone, 18 px (the slot Payload gives it). */
export function PsiIcon(): ReactElement {
	return <PsiMark size={18} id="psi-mark-icon" />;
}

/** Payload's `admin.components.graphics.Logo`: the mark and the wordmark (the sign-in page). */
export function PsiLogo(): ReactElement {
	return (
		<span className="psi-logo">
			<PsiMark size={44} id="psi-mark-logo" />
			<span className="psi-logo__word">psi</span>
		</span>
	);
}
