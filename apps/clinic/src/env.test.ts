import { describe, expect, it } from "vitest";
import { readEnv } from "./env";

describe("readEnv", () => {
	it("defaults to port 3000 and a local origin", () => {
		expect(readEnv({})).toMatchObject({ port: 3000, production: false, devSignIn: false });
	});
	it("allows the development sign-in switch outside production", () => {
		expect(readEnv({ CLINIC_DEV_SIGNIN: "1", PORT: "4370" })).toMatchObject({
			devSignIn: true,
			port: 4370,
			origin: "http://localhost:4370",
		});
	});
	it("refuses to start with the development sign-in in production", () => {
		expect(() => readEnv({ CLINIC_DEV_SIGNIN: "1", NODE_ENV: "production" })).toThrow(
			/refused when NODE_ENV=production/,
		);
		expect(() => readEnv({ CLINIC_DEV_SIGNIN: "true", NODE_ENV: "production" })).toThrow();
	});
	it("refuses a switch value that is not on", () => {
		expect(() => readEnv({ CLINIC_DEV_SIGNIN: "0" })).toThrow();
	});
	it("refuses a bad origin", () => {
		expect(() => readEnv({ CLINIC_ORIGIN: "not a url" })).toThrow();
	});
});
