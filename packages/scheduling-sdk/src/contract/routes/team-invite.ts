import { route } from "../define";
import { Invite, InvitePick, InvitePreview, InviteResend, InviteState } from "../entities-invite";
import {
	DeliveryList,
	DeliveryQuery,
	NotificationPrefs,
	NotificationPrefsView,
} from "../entities-notify";
import { AppParam, IdParam } from "../primitives";

const OnClient = {
	key: "clients_invite",
	target: { kind: "object", type: "sched_client" },
} as const;

/**
 * Turning a client into a registered user, and the person's own notification preferences. The invitation routes sit
 * under the client; the permission is `clients_invite` on that client, and the handler additionally asks for the view
 * permission of the contact group it is about to use (the client's own, or the guardian's).
 */
export const INVITE_ROUTES = [
	route({
		id: "invites.get",
		method: "GET",
		path: "/v1/apps/:app/clients/:id/invite",
		side: "team",
		summary:
			"The client's online-account invitation: invited, active, expired or revoked; null when never invited",
		params: IdParam,
		response: InviteState,
		permission: OnClient,
	}),
	route({
		id: "invites.preview",
		method: "GET",
		path: "/v1/apps/:app/clients/:id/invite/preview",
		side: "team",
		summary:
			"The invitation e-mail exactly as it would go, with a placeholder link; sends and writes nothing",
		params: IdParam,
		query: InvitePick,
		response: InvitePreview,
		permission: OnClient,
	}),
	route({
		id: "invites.send",
		method: "POST",
		path: "/v1/apps/:app/clients/:id/invite",
		side: "team",
		summary:
			"Invite the client (or their guardian) to the online account: create or find the sign-in account, link it to the client, send the e-mail",
		params: IdParam,
		body: InvitePick,
		response: Invite,
		permission: OnClient,
		audit: "client.invite",
	}),
	route({
		id: "invites.resend",
		method: "POST",
		path: "/v1/apps/:app/clients/:id/invite/resend",
		side: "team",
		summary: "Send the invitation again with a fresh link (the earlier link stops working)",
		params: IdParam,
		body: InviteResend,
		response: Invite,
		permission: OnClient,
		audit: "client.invite_resend",
	}),
	route({
		id: "invites.revoke",
		method: "DELETE",
		path: "/v1/apps/:app/clients/:id/invite",
		side: "team",
		summary:
			"Withdraw the invitation: the link stops working and the client is unlinked from the account (an account that existed before is never touched)",
		params: IdParam,
		response: Invite,
		permission: OnClient,
		audit: "client.invite_revoke",
	}),
	route({
		id: "notifications.deliveries",
		method: "GET",
		path: "/v1/apps/:app/notifications/deliveries",
		side: "team",
		summary:
			"The delivery log of one day: each notification's steps (queued, retrying, sent, given up, suppressed and why). Ids and outcomes only",
		params: AppParam,
		query: DeliveryQuery,
		response: DeliveryList,
		permission: { key: "audit_log_view", target: { kind: "app" } },
	}),
	route({
		id: "me.notifications",
		method: "GET",
		path: "/v1/apps/:app/me/notifications",
		side: "team",
		summary:
			"The caller's notification preferences (channel by kind, quiet hours) and what each kind offers",
		params: AppParam,
		response: NotificationPrefsView,
	}),
	route({
		id: "me.notificationsSave",
		method: "PUT",
		path: "/v1/apps/:app/me/notifications",
		side: "team",
		summary:
			"Replace the caller's notification preferences; a channel a kind does not offer, or that cannot be switched off, is refused",
		params: AppParam,
		body: NotificationPrefs,
		response: NotificationPrefsView,
		audit: "notifications.prefs",
	}),
] as const;
