import { z } from "zod/v4";
import { route } from "../define";
import { AppParam, Id, Ms, Ok, PageQuery, page } from "../primitives";

/**
 * A signed-in account booked with a clinic client's e-mail or phone, and the match was not certain enough to link it
 * alone (several clients, a phone, an address the sign-in does not vouch for): the team says which client it is, or
 * that it is none. `id` names the account (its hash, never the sign-in subject); no address is shown here, the
 * candidates' own records hold them.
 */
export const AccountLinkSuggestion = z.object({
	id: z.string().regex(/^[0-9a-f]{64}$/),
	via: z.enum(["email", "phone"]),
	/** The request that showed the match. */
	reference: z.string().optional(),
	at: Ms,
	/** The clients it could be that the caller may invite (a suggestion with none of them is not listed). */
	candidates: z.array(z.object({ clientId: Id, name: z.string() })).min(1),
});

/** The account hash fits the contract's id; one that names no suggestion is 404 like any other. */
const LinkParam = AppParam.extend({ id: Id });
const OnCandidates = {
	key: "clients_invite",
	target: { kind: "list", type: "sched_client" },
} as const;

export const LINK_ROUTES = [
	route({
		id: "accountLinks.list",
		method: "GET",
		path: "/v1/apps/:app/account-links",
		side: "team",
		summary:
			"Online accounts whose booking matched a client without certainty, newest first, each with the candidates the caller may invite",
		params: AppParam,
		query: PageQuery,
		response: page(AccountLinkSuggestion),
		permission: OnCandidates,
	}),
	route({
		id: "accountLinks.confirm",
		method: "POST",
		path: "/v1/apps/:app/account-links/:id/confirm",
		side: "team",
		summary:
			"Link the account to one of its candidates: it then sees that client's sessions and is told of them. 404 for no such suggestion or a client that is not a candidate; 409 `linked_elsewhere` when another account has the client",
		params: LinkParam,
		body: z.object({ clientId: Id }),
		response: Ok,
		permission: {
			key: "clients_invite",
			target: { kind: "object", type: "sched_client", idFrom: { in: "body", key: "clientId" } },
		},
		audit: "client.account_link",
	}),
	route({
		id: "accountLinks.dismiss",
		method: "POST",
		path: "/v1/apps/:app/account-links/:id/dismiss",
		side: "team",
		summary:
			"The account is none of its candidates: the suggestion goes and none of these pairs is suggested again",
		params: LinkParam,
		response: Ok,
		permission: {
			key: "clients_invite",
			target: { kind: "dynamic", type: "sched_client", candidates: ["clients_invite"] },
		},
		audit: "client.account_link_dismiss",
	}),
] as const;
