import type { Invite as ServiceInvite } from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import type { AppSlug, Invite, InvitePick, InvitePreview } from "../schema";
import type { SdkContext } from "./context";

type Wire = z.output<typeof ServiceInvite>;

/** The service's invitation as the console shows it: who invited and the client id stay with the service. */
export function inviteOf(i: Wire): Invite {
	return {
		status: i.status,
		contact: i.contact,
		sentTo: i.sentTo,
		locale: i.locale,
		invitedAt: i.invitedAt,
		expiresAt: i.expiresAt,
		sends: i.sends,
		existingAccount: i.existingAccount,
		...(i.activatedAt === undefined ? {} : { activatedAt: i.activatedAt }),
	};
}

/** The client's online-account invitation: read, preview, send, send again, withdraw. */
export function invitesGroup(sdk: SdkContext) {
	const { api, run } = sdk;
	return {
		invite: (app: AppSlug, clientId: string): Promise<Invite | null> =>
			run(async () => {
				const { invite } = await api.invites.get({ app, id: clientId });
				return invite === null ? null : inviteOf(invite);
			}),
		previewInvite: (app: AppSlug, clientId: string, pick: InvitePick): Promise<InvitePreview> =>
			run(() => api.invites.preview({ app, id: clientId, ...pick })),
		sendInvite: (app: AppSlug, clientId: string, pick: InvitePick): Promise<Invite> =>
			run(async () => inviteOf(await api.invites.send({ app, id: clientId, ...pick }))),
		resendInvite: (app: AppSlug, clientId: string): Promise<Invite> =>
			run(async () => inviteOf(await api.invites.resend({ app, id: clientId }))),
		revokeInvite: (app: AppSlug, clientId: string): Promise<Invite> =>
			run(async () => inviteOf(await api.invites.revoke({ app, id: clientId }))),
	};
}
