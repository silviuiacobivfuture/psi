import { APP_DEFAULTS, type AppKey, type Choices, type Recipient } from "@psi/notify";
import { NOTIFY_CHANNELS, NOTIFY_KINDS } from "@psi/scheduling-sdk/contract";
import { settingsOf } from "../handlers/settings";
import type { StorePort } from "../store/types";
import type { TeamName } from "./notify";
import { teamsOf } from "./teams";

/** A member's own notification choices in an app, from their stored settings (none stored: nothing switched off). */
export async function choicesOf(store: StorePort, app: AppKey, subject: string): Promise<Choices> {
	const { settings } = await settingsOf(store, app, subject);
	return {
		off: NOTIFY_KINDS.flatMap((kind) =>
			NOTIFY_CHANNELS.filter((channel) => !settings.notifications[kind][channel]).map(
				(channel) => ({ kind, channel }),
			),
		),
		quietHours:
			settings.quietHours === null
				? null
				: { ...settings.quietHours, timeZone: APP_DEFAULTS[app].timeZone },
	};
}

/**
 * A team as the people in it, each with their choices: the message then goes to each of them by subject instead of to
 * the topic, so what a person switched off holds for team messages too. The members are the app's, their teams those
 * their roles give (the same rule the directory keeps the topics by).
 */
export async function teamRecipient(
	store: StorePort,
	app: AppKey,
	team: TeamName,
): Promise<Extract<Recipient, { audience: TeamName }>> {
	const [members, roles] = await Promise.all([store.c.members.list(app), store.c.roles.list(app)]);
	const inTeam = members.filter((m) => teamsOf(m, roles).has(team));
	return {
		audience: team,
		members: await Promise.all(
			inTeam.map(async (m) => ({
				subject: m.subject,
				choices: await choicesOf(store, app, m.subject),
			})),
		),
	};
}
