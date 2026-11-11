import type { Env } from "./env";

/**
 * On an empty database, the break-glass administrator (from the environment) is the first user,
 * so the "create first user" screen is never open to whoever reaches it first. Never touches a
 * database that already has users. Returns what it did.
 */
/** The part of Payload's local API the seeding uses. */
export interface UsersSeam {
	count(args: { collection: "users"; overrideAccess: true }): Promise<{ totalDocs: number }>;
	create(args: {
		collection: "users";
		overrideAccess: true;
		data: { email: string; password: string; name: string };
	}): Promise<unknown>;
	logger: { info(msg: string): void };
}

export async function seedBreakGlass(
	payload: UsersSeam,
	env: Pick<Env, "BREAKGLASS_EMAIL" | "BREAKGLASS_PASSWORD">,
): Promise<"created" | "present"> {
	const { totalDocs } = await payload.count({ collection: "users", overrideAccess: true });
	if (totalDocs > 0) return "present";
	await payload.create({
		collection: "users",
		overrideAccess: true,
		data: { email: env.BREAKGLASS_EMAIL, password: env.BREAKGLASS_PASSWORD, name: "break-glass" },
	});
	payload.logger.info("break-glass administrator created");
	return "created";
}
