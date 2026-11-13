import { EmptyState } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { PortError } from "../port/port";

/**
 * What a screen shows instead of itself when the service refused it for a reason a retry does not cure: no access, not
 * built yet, too many calls. Never a blank page and never a crash.
 */
export function FailureState({ error, locale }: { error: PortError; locale: Locale }): JSX.Element {
	const o = at(locale);
	switch (error.code) {
		case "forbidden":
			return (
				<EmptyState icon="shield" title={m.forbidden_title({}, o)} text={m.forbidden_text({}, o)} />
			);
		case "not-available-yet":
			return <EmptyState icon="clock" title={m.soon_title({}, o)} text={m.soon_text({}, o)} />;
		case "rate-limited":
			return <EmptyState icon="clock" title={m.rate_title({}, o)} text={m.rate_text({}, o)} />;
		case "conflict":
			return (
				<EmptyState icon="alert" title={m.conflict_title({}, o)} text={m.conflict_text({}, o)} />
			);
		default:
			return <EmptyState icon="alert" title={m.error_title({}, o)} text={m.error_text({}, o)} />;
	}
}
