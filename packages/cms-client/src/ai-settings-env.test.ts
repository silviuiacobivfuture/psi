import { describe, expect, it } from "vitest";
import { aiSettingsFromEnv } from "./ai-settings-env";

describe("aiSettingsFromEnv", () => {
	it("is off without CMS_URL or CMS_API_KEY", () => {
		expect(aiSettingsFromEnv({}, "psizone")).toBeNull();
		expect(aiSettingsFromEnv({ CMS_URL: "http://localhost:4350" }, "psizone")).toBeNull();
		expect(aiSettingsFromEnv({ CMS_API_KEY: "k" }, "psizone")).toBeNull();
		expect(aiSettingsFromEnv({ CMS_URL: "", CMS_API_KEY: "k" }, "psizone")).toBeNull();
	});

	it("answers the defaults when the CMS cannot be reached, without throwing", async () => {
		const errors: Array<string> = [];
		const client = aiSettingsFromEnv(
			{ CMS_URL: "http://127.0.0.1:9/", CMS_API_KEY: "k" },
			"psizone",
			(m) => errors.push(m),
		);
		expect(client).not.toBeNull();
		const settings = await client?.get();
		expect(settings?.exchangeLimit).toBe(20);
		expect(errors.length).toBe(1);
	});
});
