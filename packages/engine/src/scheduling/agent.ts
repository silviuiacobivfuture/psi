import type { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { createProfileAgent } from "../agent";
import type { LanguagePack } from "../language/pack";
import type { Profile, ProfileLocale } from "../profile";
import type { ProfileScheduling, SchedulingPort } from "./port";
import {
	CANCEL_REQUEST_TOOL,
	createSchedulingTools,
	FIND_AVAILABILITY_TOOL,
	REQUEST_APPOINTMENT_TOOL,
	type SchedulingTools,
} from "./tools";

/**
 * The scheduling rules, numbered after the profile's voice. They are the engine's (in English;
 * the language statement before them fixes the language of the reply) and they are the same for
 * every brand: propose, never book; the Studio agent holds no booking tool. The booking dialogue itself (details, summary, submit) is the engine's, not a model's.
 */
export function schedulingRules(services: ReadonlyArray<string>): ReadonlyArray<string> {
	return [
		`You help the visitor find a time for ${services.length === 0 ? "the practice's services" : services.join(", ")}. You do nothing else here; for any other question, say the guide on the page answers it.`,
		`Propose only times that ${FIND_AVAILABILITY_TOOL} returned, with the date and time exactly as it gave them. Never invent, round or move a time.`,
		`When the visitor picks one of those times, call ${REQUEST_APPOINTMENT_TOOL}. It books nothing: it shows the visitor a confirmation form. Say the request is sent only once they confirm in that form.`,
		"Never say a time is booked, reserved or confirmed.",
		"Never ask why they want the appointment, and never ask about symptoms, diagnoses, medication or anyone's health. If they offer such details, do not repeat them; say the team talks about it by phone.",
		"Never ask for a name, a phone number or an e-mail address: the confirmation form collects them.",
		`Call ${CANCEL_REQUEST_TOOL} only when the visitor asks to cancel and gives both their booking reference and their cancel code.`,
		"When a tool answers unavailable, say booking online is not available right now and point to the booking page or the phone.",
	];
}

/** The scheduling agent's instructions for one locale. */
export function schedulingInstructions(
	pack: LanguagePack,
	locale: ProfileLocale,
	scope: ProfileScheduling,
): string {
	const rules = [...schedulingRules(scope.services), ...pack.prompt.closing].map(
		(rule, i) => `${i + 1}. ${rule}`,
	);
	return `${pack.prompt.language}\n\n${locale.voice}\n\n${[pack.prompt.rulesHeading, ...rules].join("\n")}`;
}

/** One profile's scheduling: its agent (separate from the grounded-answer agent) and its tools. */
export interface ProfileSchedulingAgent {
	readonly scope: ProfileScheduling;
	readonly agent: Agent;
	readonly tools: SchedulingTools;
}

/**
 * The scheduling agent of one profile. It is a separate Mastra agent with only the three
 * scheduling tools; the grounded-answer agent never holds them, so the per-sentence gate and the
 * scheduling path never mix.
 */
export function createSchedulingAgent(opts: {
	id: string;
	profile: Profile;
	scope: ProfileScheduling;
	pack: LanguagePack;
	locale: ProfileLocale;
	port: SchedulingPort;
	model: MastraModelConfig;
}): ProfileSchedulingAgent {
	const tools = createSchedulingTools(opts.port, opts.scope);
	const agent = createProfileAgent({
		id: opts.id,
		name: `${opts.profile.name} (scheduling)`,
		instructions: schedulingInstructions(opts.pack, opts.locale, opts.scope),
		model: opts.model,
		tools,
	});
	return { scope: opts.scope, agent, tools };
}
