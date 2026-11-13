/** Who is calling: a person signed in with the estate's SSO, or a caller's service key (scoped to one app). */
export type Principal =
	| { kind: "person"; subject: string; name?: string }
	| {
			kind: "service";
			callerId: string;
			app: string /** The visitor a site acts for on `/me` routes. */;
			onBehalfOf?: string;
	  };

/** The subject recorded in the audit log and used for OpenFGA. */
export function subjectOf(principal: Principal): string {
	return principal.kind === "person" ? principal.subject : `service:${principal.callerId}`;
}

/** Whose own data a visitor route may touch. */
export function visitorSubject(principal: Principal): string | undefined {
	return principal.kind === "person" ? principal.subject : principal.onBehalfOf;
}
