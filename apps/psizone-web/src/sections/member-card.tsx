import { PractitionerCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Member } from "../content/team";
import { at, type Locale } from "../i18n";
import { oldSitePicture } from "../imagery";
import { m } from "../paraglide/messages.js";

/** A team member's card: the portrait the centre published when there is one, else the initials. */
export function MemberCard({ member, locale }: { member: Member; locale: Locale }): JSX.Element {
	const o = at(locale);
	const p = member.portrait;
	return (
		<PractitionerCard
			class="pz-rise"
			name={member.name}
			role={member.role(o)}
			{...(p === undefined
				? {}
				: {
						picture: oldSitePicture(
							p.file,
							p.width,
							p.height,
							m.team_portrait_alt({ name: member.name }, o),
							"72px",
						),
					})}
		/>
	);
}
