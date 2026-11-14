/**
 * The staff assistant: the clinic team's chat with tools, behind the console's single sign-on.
 * This entry (`@psi/engine/staff`) is the only way to reach any of it; the visitor sites and the
 * guide never import it (a test scans for that), and the visitor engine registers none of its
 * tools. The console builds a `StaffPort` per request from the signed-in person's own token.
 */
export {
	type ActionInfo,
	ActionInfoSchema,
	type ActionOutcome,
	ActionOutcomeSchema,
	type ActionParam,
} from "./actions";
export {
	BUILT_IN_STAFF_CONFIG,
	type StaffConfig,
	type StaffUsage,
	StaffUsageSchema,
} from "./assistant-config";
export type { StaffTranscript } from "./chat";
export {
	type PanelCopy,
	STAFF_EN,
	STAFF_RO,
	type StaffCopy,
	staffCopy,
} from "./copy";
export {
	createStaffEngine,
	type StaffEngine,
	type StaffEngineOptions,
} from "./engine";
export {
	type CardLine,
	type CardRow,
	type ConfirmStatus,
	ConfirmStatusSchema,
	MAX_MESSAGE_LENGTH,
	STAFF_SCREENS,
	type StaffCard,
	StaffCardSchema,
	type StaffEvent,
	type StaffPage,
	StaffPageSchema,
	type StaffScreen,
	type StaffTurnInput,
	StaffTurnInputSchema,
	type Tone,
	type TurnRefusal,
} from "./events";
export type { ConfirmOutcome } from "./execute";
export { type SealRoot, sealRootFrom } from "./memory-seal";
export { STAFF_MEMORY_BACKSTOP_DAYS, STAFF_MEMORY_DAYS } from "./memory-store";
export * from "./model";
export { DISCOVERY_TOOLS } from "./parity/discovery";
export { isParityRoute, NEVER_REASONS } from "./parity/routes";
export type * from "./port";
export { REFUSAL_CODES, STAFF_ACTIONS } from "./port";
export {
	createMemoryProposalStore,
	PROPOSAL_TTL_MS,
	type Proposal,
	type ProposalStore,
} from "./proposals";
export {
	createStaffAssistantRoutes,
	type StaffPortSource,
	type StaffRouteOptions,
} from "./routes";
export type { StaffLinks } from "./session";
export { STAFF_TOOL_IDS, STAFF_TOOLS } from "./tool-ids";
export type { StaffViews, ViewPatch } from "./views";
