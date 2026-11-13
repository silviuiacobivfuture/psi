import { randomBytes } from "node:crypto";
import { z } from "zod";

const EnvSchema = z.object({
	NODE_ENV: z.string().optional(),
	PORT: z.coerce.number().int().positive().default(3000),
	/** The public origin (redirect URIs and same-origin checks are built from it, never from Host). */
	CLINIC_ORIGIN: z.string().url().optional(),
	/** DEV ONLY: skip sign-in with a fixed demo person. Refused in production. */
	CLINIC_DEV_SIGNIN: z.enum(["1", "true"]).optional(),
	/** DEV ONLY: serve the in-memory synthetic clinic instead of the scheduling service. Refused in production. */
	CLINIC_FAKE_PORT: z.enum(["1", "true"]).optional(),
	/** The scheduling service (apps/scheduling-api). Required whenever the fake is not on. */
	SCHEDULING_API_URL: z.string().url().optional(),
	/** Signs the "Vezi ca…" cookie (and is the session secret the sign-in already requires in production). */
	SESSION_SECRET: z.string().min(32).optional(),
});

export interface ClinicEnv {
	production: boolean;
	port: number;
	origin: string;
	devSignIn: boolean;
	fakePort: boolean;
	/** Where the scheduling service answers; null only with the fake port. */
	schedulingApi: string | null;
	/** Signs the "Vezi ca…" cookie: SESSION_SECRET, or a throwaway one per boot outside production. */
	sessionSecret: string;
}

export function readEnv(
	raw: Readonly<Record<string, string | undefined>> = process.env,
): ClinicEnv {
	const e = EnvSchema.parse(raw);
	const production = e.NODE_ENV === "production";
	const devSignIn = e.CLINIC_DEV_SIGNIN !== undefined;
	if (devSignIn && production) {
		throw new Error(
			"CLINIC_DEV_SIGNIN is a development switch: it is refused when NODE_ENV=production",
		);
	}
	const fakePort = e.CLINIC_FAKE_PORT !== undefined;
	if (fakePort && production) {
		throw new Error(
			"CLINIC_FAKE_PORT is a development switch: it is refused when NODE_ENV=production",
		);
	}
	if (!fakePort && e.SCHEDULING_API_URL === undefined) {
		throw new Error(
			"MISSING REQUIRED SETTING: SCHEDULING_API_URL (or CLINIC_FAKE_PORT=1 for development)",
		);
	}
	if (production && e.SESSION_SECRET === undefined) {
		throw new Error("MISSING REQUIRED SECRET: SESSION_SECRET (at least 32 characters)");
	}
	return {
		sessionSecret: e.SESSION_SECRET ?? randomBytes(32).toString("hex"),
		production,
		port: e.PORT,
		origin: e.CLINIC_ORIGIN ?? `http://localhost:${e.PORT}`,
		devSignIn,
		fakePort,
		schedulingApi: e.SCHEDULING_API_URL ?? null,
	};
}
