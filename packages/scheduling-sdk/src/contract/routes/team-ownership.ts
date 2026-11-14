import { z } from "zod/v4";
import { route } from "../define";
import { Member } from "../entities";
import { AppParam, Subject } from "../primitives";

/** Handing the organisation over: the new owner takes the Owner roles, the one who gives it keeps what those include. */
export const OwnershipTransfer = z.object({ to: Subject });
/** `from` is null when an estate administrator, not a member, handed it over (the new owner takes the Owner role). */
export const OwnershipTransferred = z.object({ from: Member.nullable(), to: Member });

export const OWNERSHIP_ROUTES = [
	route({
		id: "ownership.transfer",
		method: "POST",
		path: "/v1/apps/:app/ownership",
		side: "team",
		summary:
			"Hand the organisation to another member: they take every role of the caller that holds the ownership, the caller keeps the roles those include (an Owner stays an Administrator)",
		params: AppParam,
		body: OwnershipTransfer,
		response: OwnershipTransferred,
		permission: { key: "organisation_transfer", target: { kind: "app" } },
		audit: "ownership.transfer",
	}),
] as const;
