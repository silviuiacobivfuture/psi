"use client";
import { useAuth } from "@payloadcms/ui";
import { usePathname } from "next/navigation";
import { type ReactElement, type ReactNode, useEffect, useRef } from "react";
import { slideDue } from "../auth/session-lifetime";

/**
 * Renews the sign-in while it is used. Payload on its own renews a token only in its last
 * minutes, and only in a tab left open; a person who opens the admin every day and closes it would
 * be signed out a lifetime after signing IN. Here every admin page a signed-in person opens renews
 * the session (Payload's own refresh: the session's end moves to now + lifetime, the cookie is set
 * again) once its token is `slideDue` — hourly at most. Signed out, or renewal refused, nothing
 * happens here: Payload's own handling decides.
 */
export function SessionKeeper({
	children,
	lifetimeSeconds,
}: {
	children?: ReactNode;
	lifetimeSeconds: number;
}): ReactElement {
	const { user, authSession, refreshCookieAsync } = useAuth();
	const expiresAt = authSession?.expiresAt;
	const pathname = usePathname();
	const renewing = useRef(false);

	useEffect(() => {
		if (pathname === null || user === null || user === undefined || renewing.current) return;
		if (!slideDue(expiresAt, Date.now(), lifetimeSeconds)) return;
		renewing.current = true;
		void refreshCookieAsync()
			.catch(() => undefined)
			.finally(() => {
				renewing.current = false;
			});
	}, [pathname, user, expiresAt, lifetimeSeconds, refreshCookieAsync]);

	return <>{children}</>;
}
