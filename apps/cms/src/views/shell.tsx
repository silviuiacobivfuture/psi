import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import type { ReactElement, ReactNode } from "react";
import type { PsiKey } from "../i18n";

/** A psi admin page inside Payload's own frame (navigation, header, theme). */
export function Shell({
	props,
	title,
	intro,
	children,
}: {
	props: AdminViewServerProps;
	title: string;
	intro: string;
	children: ReactNode;
}): ReactElement {
	const { initPageResult, params, searchParams } = props;
	return (
		<DefaultTemplate
			i18n={initPageResult.req.i18n}
			locale={initPageResult.locale}
			params={params}
			payload={initPageResult.req.payload}
			permissions={initPageResult.permissions}
			searchParams={searchParams}
			user={initPageResult.req.user ?? undefined}
			visibleEntities={initPageResult.visibleEntities}
		>
			<Gutter>
				<div className="psi-view">
					<h1 style={{ marginTop: "calc(var(--base) * 2)" }}>{title}</h1>
					<p style={{ color: "var(--theme-elevation-600)", maxWidth: "70ch" }}>{intro}</p>
					{children}
				</div>
			</Gutter>
		</DefaultTemplate>
	);
}

/** The view's strings in the editor's admin language. */
export function sayer(props: AdminViewServerProps): (k: PsiKey) => string {
	const t = props.initPageResult.req.i18n.t;
	return (k) => t(`psi:${k}` as Parameters<typeof t>[0]);
}

export const cell = {
	padding: "calc(var(--base) / 3) calc(var(--base) / 2)",
	borderBottom: "1px solid var(--theme-elevation-100)",
	textAlign: "left",
	verticalAlign: "top",
} as const;
