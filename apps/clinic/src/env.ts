import { z } from "zod";

const EnvSchema = z.object({
	NODE_ENV: z.string().optional(),
	PORT: z.coerce.number().int().positive().default(3000),
	/** The public origin (redirect URIs and same-origin checks are built from it, never from Host). */
	CLINIC_ORIGIN: z.string().url().optional(),
	/** DEV ONLY: skip sign-in with a fixed demo person. Refused in production. */
	CLINIC_DEV_SIGNIN: z.enum(["1", "true"]).optional(),
});

export interface ClinicEnv {
	production: boolean;
	port: number;
	origin: string;
	devSignIn: boolean;
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
	return {
		production,
		port: e.PORT,
		origin: e.CLINIC_ORIGIN ?? `http://localhost:${e.PORT}`,
		devSignIn,
	};
}
