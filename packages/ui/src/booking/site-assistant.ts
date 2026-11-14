import { SchedulingUnavailable } from "@psi/scheduling";
import { createSchedulingClient as createSdkClient, SchedulingApiError } from "@psi/scheduling-sdk";
import type {
	AssistantEffectiveType,
	AssistantVisitorUsageRecordType,
} from "@psi/scheduling-sdk/contract";
import type { SchedulingApiConfig } from "./service-env";

/**
 * A public site's visitor assistant as its organisation governs it, asked of the scheduling service (its
 * `visitor.assistant` routes) with the site's own service key: no store credentials on the site. `read` is what governs
 * the next turn (the settings the service merged, a stop, the meters), undefined when the service has no such app;
 * `record` adds one turn's use. Any other failure (down, past the deadline, a refusal) throws `SchedulingUnavailable`.
 */
export interface SiteAssistant {
	read(tenant: string): Promise<AssistantEffectiveType | undefined>;
	record(tenant: string, usage: AssistantVisitorUsageRecordType): Promise<void>;
}

export function createSiteAssistant(config: SchedulingApiConfig): SiteAssistant {
	const sdk = createSdkClient({
		baseUrl: config.url,
		timeoutMs: config.timeoutMs,
		auth: { serviceKey: config.serviceKey },
	});
	const unavailable = (error: unknown, call: string): never => {
		throw new SchedulingUnavailable(
			error instanceof SchedulingApiError
				? `the scheduling service refused ${call} (${error.code})`
				: `the scheduling service could not be asked for ${call}`,
		);
	};
	return {
		async read(tenant) {
			try {
				return await sdk.visitor.assistant({ app: tenant });
			} catch (error) {
				if (error instanceof SchedulingApiError && error.code === "not_found") return undefined;
				return unavailable(error, "the assistant's settings");
			}
		},
		async record(tenant, usage) {
			try {
				await sdk.visitor.assistantUsage({ app: tenant, ...usage });
			} catch (error) {
				unavailable(error, "the assistant's meters");
			}
		},
	};
}
