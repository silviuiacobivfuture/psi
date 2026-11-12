import type { ControlPorts, PushStats, Site } from "@psi/cms-client";
import type { Pwa } from "@psi/pwa";

/** Push for the control plane: counts by purpose, and a test to the staff member's own devices. */
export function pushPort(pwa: Pwa, site: Site): NonNullable<ControlPorts["push"]> {
	return {
		async stats(): Promise<PushStats> {
			if (pwa.config.vapid === null) {
				return {
					state: "off",
					byTopic: [],
					total: 0,
					signedIn: 0,
					failing: 0,
					announced: 0,
					reason: pwa.config.off ?? "off",
				};
			}
			const s = await (await pwa.store()).stats(site);
			return {
				state: "on",
				byTopic: Object.entries(s.byTopic).flatMap(([topic, n]) =>
					typeof n === "number" ? [{ topic, subscribers: n }] : [],
				),
				total: s.total,
				signedIn: s.signedIn,
				failing: s.failing,
				announced: s.announced,
			};
		},
		async test(subject) {
			const notifier = await pwa.notifier();
			if (notifier === null) return { recipients: 0, sent: 0, failed: 0 };
			const r = await notifier.testAccount(subject, site);
			return { recipients: r.recipients, sent: r.sent, failed: r.failed };
		},
	};
}
