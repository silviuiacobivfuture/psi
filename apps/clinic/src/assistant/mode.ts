import { createHash } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { type ClinicPort, PortError } from "../port/port";
import { type AssistantMode, AssistantModeSchema } from "../port/schema";

/** How the assistant shows when the person never chose: the conversation bar. */
export const DEFAULT_MODE: AssistantMode = "bar";

const COOKIE = "assistant";
const YEAR = 31_536_000;

/** `bar.1f2e3d4c`: the choice and a short digest of whose it is, so a shared browser never lends one person's choice to another. */
function sealed(subject: string, mode: AssistantMode): string {
	return `${mode}.${createHash("sha256").update(subject).digest("hex").slice(0, 8)}`;
}

function fromCookie(c: Context, subject: string): AssistantMode | undefined {
	const raw = getCookie(c, COOKIE);
	if (raw === undefined) return undefined;
	const mode = AssistantModeSchema.safeParse(raw.split(".")[0]);
	return mode.success && sealed(subject, mode.data) === raw ? mode.data : undefined;
}

function remember(c: Context, subject: string, mode: AssistantMode): void {
	setCookie(c, COOKIE, sealed(subject, mode), { path: "/", maxAge: YEAR, sameSite: "Lax" });
}

/**
 * How this person's assistant shows: what the service has for them (read once, then kept on the
 * device so a page costs no call), else the default. A service that keeps no such setting yet
 * (`not-available-yet`) leaves it to the device.
 */
export async function assistantModeOf(
	c: Context,
	port: ClinicPort,
	subject: string,
): Promise<AssistantMode> {
	const kept = fromCookie(c, subject);
	if (kept !== undefined) return kept;
	try {
		const stored = await port.assistantMode(subject);
		if (stored !== null) {
			remember(c, subject, stored);
			return stored;
		}
	} catch (error) {
		if (!(error instanceof PortError) || error.code !== "not-available-yet") throw error;
	}
	return DEFAULT_MODE;
}

/** The person chose: saved through the port (their own, for any device), and on this device. */
export async function chooseAssistantMode(
	c: Context,
	port: ClinicPort,
	subject: string,
	mode: AssistantMode,
): Promise<void> {
	try {
		await port.saveAssistantMode(subject, mode);
	} catch (error) {
		if (!(error instanceof PortError) || error.code !== "not-available-yet") throw error;
	}
	remember(c, subject, mode);
}
