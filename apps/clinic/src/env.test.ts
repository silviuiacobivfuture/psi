import { describe, expect, it } from "vitest";
import { readEnv } from "./env";

describe("readEnv", () => {
	it("defaults to port 3000 and a local origin", () => {
		expect(readEnv({ CLINIC_FAKE_PORT: "1" })).toMatchObject({
			port: 3000,
			production: false,
			devSignIn: false,
		});
	});
	it("allows the development sign-in switch outside production", () => {
		expect(readEnv({ CLINIC_DEV_SIGNIN: "1", CLINIC_FAKE_PORT: "1", PORT: "4370" })).toMatchObject({
			devSignIn: true,
			port: 4370,
			origin: "http://localhost:4370",
		});
	});
	it("refuses to start with the development sign-in in production", () => {
		expect(() =>
			readEnv({
				CLINIC_DEV_SIGNIN: "1",
				NODE_ENV: "production",
				SCHEDULING_API_URL: "http://x.test",
			}),
		).toThrow(/refused when NODE_ENV=production/);
		expect(() =>
			readEnv({
				CLINIC_DEV_SIGNIN: "true",
				NODE_ENV: "production",
				SCHEDULING_API_URL: "http://x.test",
			}),
		).toThrow();
	});
	it("refuses a switch value that is not on", () => {
		expect(() => readEnv({ CLINIC_DEV_SIGNIN: "0", CLINIC_FAKE_PORT: "1" })).toThrow();
	});
	it("refuses a bad origin", () => {
		expect(() => readEnv({ CLINIC_ORIGIN: "not a url", CLINIC_FAKE_PORT: "1" })).toThrow();
	});
	it("refuses the fake clinic in production", () => {
		expect(() => readEnv({ CLINIC_FAKE_PORT: "1", NODE_ENV: "production" })).toThrow(
			/CLINIC_FAKE_PORT.*refused/,
		);
	});
	it("needs the scheduling service unless the fake is on, and says so by name", () => {
		expect(() => readEnv({})).toThrow(/MISSING REQUIRED SETTING: SCHEDULING_API_URL/);
		expect(() => readEnv({ NODE_ENV: "production" })).toThrow(/SCHEDULING_API_URL/);
		expect(
			readEnv({ SCHEDULING_API_URL: "http://scheduling-api.scheduling.svc:8080" }).schedulingApi,
		).toBe("http://scheduling-api.scheduling.svc:8080");
	});
	it("refuses a scheduling URL that is not a URL", () => {
		expect(() => readEnv({ SCHEDULING_API_URL: "scheduling" })).toThrow();
	});
	it("production needs the session secret, by name, and takes it from SESSION_SECRET", () => {
		expect(() => readEnv({ NODE_ENV: "production", SCHEDULING_API_URL: "http://x.test" })).toThrow(
			/SESSION_SECRET/,
		);
		expect(
			readEnv({
				NODE_ENV: "production",
				SCHEDULING_API_URL: "http://x.test",
				SESSION_SECRET: "s".repeat(40),
			}).sessionSecret,
		).toBe("s".repeat(40));
	});
	it("refuses a session secret that is too short", () => {
		expect(() => readEnv({ CLINIC_FAKE_PORT: "1", SESSION_SECRET: "short" })).toThrow();
	});
});
