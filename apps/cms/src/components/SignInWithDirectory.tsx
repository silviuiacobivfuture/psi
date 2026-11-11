"use client";
import { useTranslation } from "@payloadcms/ui";
import type { ReactElement } from "react";
import type { CustomKey } from "../i18n";

/** The sign-in through the estate's directory, under the local (break-glass) form. */
export function SignInWithDirectory(): ReactElement {
	const { t } = useTranslation<object, CustomKey>();
	return (
		<div style={{ marginTop: "var(--base)" }}>
			{/* A document navigation, not client routing: the endpoint answers with a redirect. */}
			<a className="btn btn--style-primary btn--size-large" href="/api/users/oauth/authorize">
				{t("psi:signInWithDirectory")}
			</a>
		</div>
	);
}
