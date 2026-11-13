import { z } from "zod/v4";
import { AppId, FieldGroup, Id, Scope, Subject } from "./primitives";

const Name = z.string().trim().min(1).max(200);

/** `role:<id>` or `member:<subject>`: who a roles administrator looks at the app as (a bare subject is a member). */
export const ViewAsTarget = z.string().regex(/^((role|member):)?[^\s:][^\s]{0,199}$/);
export const ViewAsBody = z.object({ as: ViewAsTarget });
/** The header every call sends while viewing as someone else; the service refuses a write that carries it. */
export const VIEW_AS_HEADER = "x-psi-view-as";

/**
 * Who the caller is in ONE app and what they may do there, from the same relations the server enforces: what a console
 * needs to decide which screens, menu items, actions and fields to offer. A hint, never the authority: every call is
 * authorized again when it is made. With `as`, the same for a role or another member (the roles editor's view-as).
 */
export const Capabilities = z.object({
	subject: Subject,
	app: AppId,
	appName: Name,
	timeZone: z.string().min(1).max(60),
	displayName: z.string().optional(),
	roles: z.array(Id),
	/**
	 * Permission to the scopes held: the key without its scope (`clients_view`, `clients_view_clinical`), the scopes at
	 * which it is held (`["all"]` for an app-wide permission). A key not listed is not held.
	 */
	permissions: z.record(z.string(), z.array(Scope)),
	/** Relations individually denied (`clients_view_own`); they are absent from `permissions`. */
	denied: z.array(z.string()),
	/** The field groups the caller may see on at least some rows, derived from `permissions`. */
	fieldGroups: z.array(FieldGroup),
	/**
	 * Whose rows the narrowed scopes reach: the people (calendar columns) that are the caller's own, and the ones they
	 * coordinate. A role has no person, so viewing as a role reaches neither.
	 */
	reach: z.object({ own: z.array(Id), assigned: z.array(Id) }),
	/** The estate's platform administrator (holds apps, members and roles in every app). */
	platformAdmin: z.boolean(),
	/** Present when this is what someone else would see: a role or a member. */
	viewAs: z.object({ kind: z.enum(["role", "member"]), id: z.string() }).optional(),
});
