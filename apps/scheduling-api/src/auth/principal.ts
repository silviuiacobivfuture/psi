/** Who is calling: a person signed in with the estate's SSO, or a caller's service key (scoped to one app). */
export type Principal =
	| {
			kind: "person";
			subject: string;
			name?: string;
			/** The e-mail the sign-in vouches for (`email_verified`), when it does. */
			verifiedEmail?: string;
	  }
	| {
			kind: "service";
			callerId: string;
			app: string /** The visitor a site acts for on `/me` routes. */;
			onBehalfOf?: string;
			/** The e-mail the site's own sign-in vouches for, for the visitor it names (`x-psi-verified-email`). */
			verifiedEmail?: string;
	  };

/** The subject recorded in the audit log and used for OpenFGA. */
export function subjectOf(principal: Principal): string {
	return principal.kind === "person" ? principal.subject : `service:${principal.callerId}`;
}

/** Whose own data a visitor route may touch. */
export function visitorSubject(principal: Principal): string | undefined {
	return principal.kind === "person" ? principal.subject : principal.onBehalfOf;
}

/** The e-mail the caller's sign-in vouches for: the person's own, or the one a site vouches for the visitor it names. */
export function verifiedEmailOf(principal: Principal): string | undefined {
	if (principal.kind === "person") return principal.verifiedEmail;
	return principal.onBehalfOf === undefined ? undefined : principal.verifiedEmail;
}
