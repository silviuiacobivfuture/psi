/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { Button, GlassCard, StatusBadge } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { SignedIn } from "./guard";

/**
 * The account panel every site renders inside its own page shell and theme. It ships NO text: every word comes from
 * the site's messages through `labels` (i18n-first; the same rule as @psi/ui).
 */
export interface AccountPanelLabels {
	signedOutTitle: string;
	signedOutLead: string;
	signIn: string;
	/** Shown when this site's sign-in is not configured (outside production only). */
	unavailable: string;
	signedInAs: string;
	signOut: string;
	/** What the account holds and never holds, in one sentence (docs/plans/accounts.md §3). */
	privacyNote: string;
}

export interface AccountPanelProps {
	labels: AccountPanelLabels;
	person: SignedIn | null;
	signInHref: string;
	signOutAction: string;
	/** False when the site cannot sign anybody in right now. */
	signInReady: boolean;
	/** The site's own sections, shown to a signed-in person. */
	children?: Child;
}

export function AccountPanel({
	labels,
	person,
	signInHref,
	signOutAction,
	signInReady,
	children,
}: AccountPanelProps): JSX.Element {
	if (person === null) {
		return (
			<div class="mx-auto max-w-xl" data-account="signed-out">
				<GlassCard class="p-8">
					<h2 class="display text-display-md text-ink">
						{labels.signedOutTitle}
					</h2>
					<p class="mt-3 text-body text-ink-muted">{labels.signedOutLead}</p>
					<div class="mt-6">
						{signInReady ? (
							<Button href={signInHref} arrow>
								{labels.signIn}
							</Button>
						) : (
							<StatusBadge tone="warning">{labels.unavailable}</StatusBadge>
						)}
					</div>
					<p class="mt-6 text-body-sm text-ink-muted">{labels.privacyNote}</p>
				</GlassCard>
			</div>
		);
	}
	const who = person.name ?? person.email ?? "";
	return (
		<div class="mx-auto flex max-w-3xl flex-col gap-6" data-account="signed-in">
			<GlassCard class="flex flex-wrap items-center gap-4 p-6">
				<div class="min-w-[14rem] flex-1">
					<p class="text-overline uppercase tracking-[0.14em] text-ink-muted">
						{labels.signedInAs}
					</p>
					<p class="mt-1 truncate text-body-lg text-ink">{who}</p>
					{person.email !== null && person.name !== null ? (
						<p class="truncate text-body-sm text-ink-muted">{person.email}</p>
					) : null}
				</div>
				<form method="post" action={signOutAction}>
					<Button type="submit" variant="outline" size="sm">
						{labels.signOut}
					</Button>
				</form>
			</GlassCard>
			{children}
			<p class="text-body-sm text-ink-muted">{labels.privacyNote}</p>
		</div>
	);
}

/** One titled section of a site's account page. */
export function AccountSection({
	title,
	children,
}: {
	title: string;
	children?: Child;
}): JSX.Element {
	return (
		<GlassCard class="p-6">
			<h3 class="text-headline text-ink">{title}</h3>
			<div class="mt-4">{children}</div>
		</GlassCard>
	);
}
