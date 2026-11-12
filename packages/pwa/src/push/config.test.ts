import { describe, expect, it } from "vitest";
import { PushConfigError, readPushConfig } from "./config";

/** A well-formed pair (shape only: these are not real keys). */
const PUBLIC = `B${"A".repeat(86)}`;
const PRIVATE = "C".repeat(43);

describe("readPushConfig", () => {
	it("turns push off in production when no push key is set, and says why", () => {
		const c = readPushConfig({ NODE_ENV: "production", ACCOUNT_DATABASE_URL: "postgresql://x/y" });
		expect(c.vapid).toBeNull();
		expect(c.storage).toBe("off");
		expect(c.off).toBe("no VAPID keys configured");
	});

	it("turns push on with a complete set", () => {
		const c = readPushConfig({
			NODE_ENV: "production",
			VAPID_PUBLIC_KEY: PUBLIC,
			VAPID_PRIVATE_KEY: PRIVATE,
			VAPID_SUBJECT: "mailto:ops@psizone.ro",
			PWA_NOTIFY_SECRET: "s".repeat(40),
			ACCOUNT_DATABASE_URL: "postgresql://x/y",
		});
		expect(c.vapid?.publicKey).toBe(PUBLIC);
		expect(c.notifySecret).toHaveLength(40);
		expect(c.storage).toBe("postgres");
		expect(c.off).toBeNull();
	});

	it.each([
		[{ VAPID_PUBLIC_KEY: PUBLIC }, /VAPID_PRIVATE_KEY missing/],
		[{ VAPID_PRIVATE_KEY: PRIVATE }, /VAPID_PUBLIC_KEY missing/],
		[{ PWA_NOTIFY_SECRET: "s".repeat(40) }, /VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY missing/],
		[{ VAPID_SUBJECT: "mailto:ops@psizone.ro" }, /missing/],
		[{ VAPID_PUBLIC_KEY: "short", VAPID_PRIVATE_KEY: PRIVATE }, /publicKey malformed/],
		[
			{ VAPID_PUBLIC_KEY: PUBLIC, VAPID_PRIVATE_KEY: PRIVATE, PWA_NOTIFY_SECRET: "short" },
			/PWA_NOTIFY_SECRET/,
		],
	])("refuses a partial or malformed set: %o", (env, message) => {
		expect(() =>
			readPushConfig({ NODE_ENV: "production", ACCOUNT_DATABASE_URL: "postgresql://x/y", ...env }),
		).toThrow(message);
	});

	it("refuses keys with nowhere to keep subscriptions in production", () => {
		expect(() =>
			readPushConfig({
				NODE_ENV: "production",
				VAPID_PUBLIC_KEY: PUBLIC,
				VAPID_PRIVATE_KEY: PRIVATE,
			}),
		).toThrow(PushConfigError);
	});

	it("never puts a value in its messages", () => {
		try {
			readPushConfig({ NODE_ENV: "production", VAPID_PUBLIC_KEY: PUBLIC });
		} catch (err) {
			expect(String(err)).not.toContain(PUBLIC);
		}
	});
});
