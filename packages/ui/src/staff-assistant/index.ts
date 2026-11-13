/**
 * The staff assistant's component for the clinic console (`@psi/ui/staff-assistant`): a docked
 * panel, its cards and the views the assistant's routes draw with. Not part of `@psi/ui`'s main
 * entry and never imported by a visitor site (a test scans for that).
 */
export { CardView } from "./cards";
export { StaffPanel, type StaffPanelProps, StaffTrigger, type StaffTriggerProps } from "./panel";
export { jsString, safeHref } from "./safe";
export { staffViews } from "./views";
