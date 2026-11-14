import { SchedulingApiError } from "@psi/scheduling-sdk";
import { PortError, type TeamMember } from "../port";
import type { AppSlug } from "../schema";
import {
	type InviteInput,
	InviteInputSchema,
	type InviteOutcome,
	InviteOutcomeSchema,
	type MemberDetail,
	MemberDetailSchema,
	type MemberInput,
	MemberInputSchema,
	type OverridesInput,
	OverridesInputSchema,
	type StaffMatch,
	StaffMatchSchema,
	StaffQuerySchema,
} from "../schema-members";
import type { SdkContext } from "./context";

/** The team's members over the service's `members` routes, and a calendar bound to a sign-in over `people`. */
export function membersGroup(sdk: SdkContext) {
	const { api, run } = sdk;
	return {
		member: (app: AppSlug, subject: string): Promise<MemberDetail | null> =>
			run(async () => {
				try {
					return MemberDetailSchema.parse(await api.members.get({ app, subject }));
				} catch (error) {
					if (error instanceof SchedulingApiError && error.code === "not_found") return null;
					throw error;
				}
			}),

		saveMember: (app: AppSlug, subject: string, raw: MemberInput): Promise<TeamMember> =>
			run(async () => {
				const input = MemberInputSchema.safeParse(raw);
				if (!input.success) throw new PortError("invalid", "member");
				const saved = await api.members.put({
					app,
					subject,
					displayName: input.data.displayName,
					roles: input.data.roles,
					coordinates: input.data.coordinates,
					...(input.data.email === undefined ? {} : { email: input.data.email }),
				});
				return {
					subject: saved.subject,
					displayName: saved.displayName,
					roles: saved.roles,
					...(saved.email === undefined ? {} : { email: saved.email }),
				};
			}),

		saveMemberOverrides: (app: AppSlug, subject: string, raw: OverridesInput) =>
			run(async () => {
				const input = OverridesInputSchema.safeParse(raw);
				if (!input.success) throw new PortError("invalid", "overrides");
				return api.members.overrides({
					app,
					subject,
					grant: input.data.grant,
					deny: input.data.deny,
				});
			}),

		removeMember: (app: AppSlug, subject: string): Promise<void> =>
			run(async () => {
				await api.members.remove({ app, subject });
			}),

		searchStaff: (app: AppSlug, query: string): Promise<ReadonlyArray<StaffMatch>> =>
			run(async () => {
				const q = StaffQuerySchema.safeParse(query);
				if (!q.success) return [];
				const out = await api.staff.search({ app, q: q.data });
				return out.items.map((i) => StaffMatchSchema.parse(i));
			}),

		inviteMember: (app: AppSlug, raw: InviteInput): Promise<InviteOutcome> =>
			run(async () => {
				const input = InviteInputSchema.safeParse(raw);
				if (!input.success) throw new PortError("invalid", "invite");
				const out = await api.staff.invite({ app, ...input.data });
				return InviteOutcomeSchema.parse({
					subject: out.member.subject,
					displayName: out.member.displayName,
					account: out.account,
					signInLink: out.signInLink,
				});
			}),

		linkCalendar: (app: AppSlug, subject: string, personId: string): Promise<void> =>
			run(async () => {
				await api.people.update({ app, id: personId, subject });
			}),
	};
}
