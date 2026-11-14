import { z } from "zod";
import { profileFromForm } from "../pages/org-profile-form";
import { m } from "../paraglide/messages.js";
import { OrgProfileSchema } from "../port/org-port";
import { define, label } from "./define";
import type { ActionDef } from "./types";

/** The profile form as posted: the revision it was edited from, and its text fields. */
const ProfileForm = z
	.object({ revision: z.coerce.number().int().min(0) })
	.catchall(z.string().max(1000));

/**
 * The organisation's own settings that are not a catalogue: today its contact profile, saved whole from the revision
 * it was edited from. The assistant runs the same action as the page.
 */
export const ORG_ACTIONS: ReadonlyArray<ActionDef> = [
	define({
		id: "org.profile",
		tier: "org",
		entity: "none",
		label: label((o) => m.st_org_save({}, o)),
		icon: "settings",
		placements: { palette: ["settings"] },
		mobile: "list",
		needs: { write: ["app_settings_edit"] },
		route: { method: "POST", path: "/settings/profile" },
		confirm: "none",
		to: () => "/settings/profile",
		params: ProfileForm,
		run: async (ctx, p) => {
			const { revision, ...fields } = p;
			const profile = OrgProfileSchema.safeParse(profileFromForm(fields));
			if (!profile.success) return { status: "refused", code: "invalid" };
			const saved = await ctx.port.saveOrgProfile(ctx.app, revision, profile.data);
			if (!saved.ok)
				return { status: "refused", code: saved.reason === "stale" ? "conflict" : "invalid" };
			return { status: "ok", to: "/settings/profile?saved=1", data: saved.view };
		},
	}),
];
