import type { AssistantStaffOverrideType } from "@psi/scheduling-sdk/contract";
import type { JSX } from "hono/jsx/jsx-runtime";
import { isLimitOverride, type OverrideOf, ROLE_FIELD_NAMES } from "../lib/assistant-form";
import type { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { AssistantOrgConfigType } from "../port/port";

type O = ReturnType<typeof at>;

const LABEL = {
	enabled: (o: O) => m.as_r_enabled({}, o),
	model: (o: O) => m.as_r_model({}, o),
	maxToolCalls: (o: O) => m.as_r_maxToolCalls({}, o),
	messagesPerDay: (o: O) => m.as_r_messagesPerDay({}, o),
	tokensPerRequest: (o: O) => m.as_r_tokensPerRequest({}, o),
} as const;

/** What an override's field inherits: the organisation's staff setting it overrides. */
function inheritedOf(
	field: Exclude<(typeof ROLE_FIELD_NAMES)[number], "enabled">,
	s: AssistantOrgConfigType["effective"]["staff"],
): string {
	switch (field) {
		case "model":
			return s.model.primary;
		case "maxToolCalls":
			return String(s.maxToolCalls);
		case "messagesPerDay":
			return String(s.messages.perDay);
		case "tokensPerRequest":
			return String(s.tokens.perRequest);
		default: {
			const never: never = field;
			return never;
		}
	}
}

/**
 * One role's or one person's overrides of the staff assistant as a fieldset: `<of>.<id>.<field>`, empty is the
 * organisation's setting (shown as the placeholder).
 */
export function OverrideFields(props: {
	of: OverrideOf;
	id: string;
	legend: string;
	own: AssistantStaffOverrideType;
	staff: AssistantOrgConfigType["effective"]["staff"];
	/** The limits are shown, not changed: `assistant_budget_edit` is the Owner's. */
	lockLimits?: boolean;
	o: O;
}): JSX.Element {
	const { of, id, own, staff, o } = props;
	return (
		<fieldset class="adm-stack" {...{ [`data-${of}`]: id }}>
			<legend class="adm-h3">{props.legend}</legend>
			<div class="adm-grid">
				{ROLE_FIELD_NAMES.map((field) => {
					const name = `${of}.${id}.${field}`;
					const value = own[field];
					return field === "enabled" ? (
						<label key={field} class="adm-field">
							<span>{LABEL[field](o)}</span>
							<select class="adm-input" name={name}>
								<option value="" selected={value === undefined}>
									{m.as_inherit({}, o)}
								</option>
								<option value="on" selected={value === true}>
									{m.as_on({}, o)}
								</option>
								<option value="off" selected={value === false}>
									{m.as_off({}, o)}
								</option>
							</select>
						</label>
					) : (
						<label key={field} class="adm-field">
							<span>{LABEL[field](o)}</span>
							<input
								class="adm-input"
								name={name}
								type={field === "model" ? "text" : "number"}
								value={value === undefined ? "" : String(value)}
								placeholder={inheritedOf(field, staff)}
								readonly={props.lockLimits === true && isLimitOverride(field)}
							/>
						</label>
					);
				})}
			</div>
		</fieldset>
	);
}
