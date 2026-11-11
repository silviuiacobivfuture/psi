import { describe, expect, it } from "vitest";
import { seedBreakGlass, type UsersSeam } from "./breakglass";

/** A stand-in for Payload's local API (a third-party seam), recording what was written. */
function fake(users: number): { seam: UsersSeam; created: unknown[] } {
	const created: unknown[] = [];
	const seam: UsersSeam = {
		count: async () => ({ totalDocs: users }),
		create: async (args: unknown) => {
			created.push(args);
			return {};
		},
		logger: { info: () => undefined },
	};
	return { seam, created };
}
const env = { BREAKGLASS_EMAIL: "b@psizone.ro", BREAKGLASS_PASSWORD: "p".repeat(16) };

describe("seedBreakGlass", () => {
	it("creates the administrator on an empty database", async () => {
		const f = fake(0);
		expect(await seedBreakGlass(f.seam, env)).toBe("created");
		expect(f.created).toEqual([
			{
				collection: "users",
				overrideAccess: true,
				data: { email: "b@psizone.ro", password: "p".repeat(16), name: "break-glass" },
			},
		]);
	});
	it.each([1, 5])("writes nothing when %i users exist", async (n) => {
		const f = fake(n);
		expect(await seedBreakGlass(f.seam, env)).toBe("present");
		expect(f.created).toEqual([]);
	});
});
