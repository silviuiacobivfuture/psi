import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { startApi } from "@psi/scheduling-api/testing";
import { describe, expect, it } from "vitest";

const freePort = (): Promise<number> =>
	new Promise((resolve, reject) => {
		const s = createServer();
		s.listen(0, "127.0.0.1", () => {
			const address = s.address();
			s.close(() =>
				address !== null && typeof address === "object"
					? resolve(address.port)
					: reject(new Error("no port")),
			);
		});
	});

interface Boot {
	child: ChildProcess;
	out: () => string;
	exited: Promise<number | null>;
}
/** The real server entry, as `pnpm start` runs it, with only the environment given. */
function boot(env: Record<string, string>): Boot {
	let out = "";
	const child = spawn("pnpm", ["exec", "tsx", "src/server.tsx"], {
		cwd: new URL("..", import.meta.url),
		env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
	});
	child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
	child.stderr?.on("data", (d: Buffer) => (out += d.toString()));
	return { child, out: () => out, exited: new Promise((r) => child.on("exit", (code) => r(code))) };
}
const stop = async (b: Boot): Promise<void> => {
	b.child.kill("SIGTERM");
	await Promise.race([b.exited, new Promise((r) => setTimeout(r, 3000))]);
};

describe("the server entry refuses to boot half-configured, by name", () => {
	const production = { NODE_ENV: "production", SESSION_SECRET: "s".repeat(40) };
	it("production with the service URL but no sign-in settings", async () => {
		const b = boot({
			...production,
			SCHEDULING_API_URL: "http://scheduling-api.scheduling-api.svc",
		});
		expect(await b.exited).not.toBe(0);
		expect(b.out()).toContain("MISSING REQUIRED SECRET: OIDC_CLIENT_ID");
	}, 60_000);
	it("production with no service URL", async () => {
		const b = boot(production);
		expect(await b.exited).not.toBe(0);
		expect(b.out()).toContain("MISSING REQUIRED SETTING: SCHEDULING_API_URL");
	}, 60_000);
	it("production with no session secret", async () => {
		const b = boot({ NODE_ENV: "production", SCHEDULING_API_URL: "http://x.test" });
		expect(await b.exited).not.toBe(0);
		expect(b.out()).toContain("SESSION_SECRET");
	}, 60_000);
	it("production with the fake clinic", async () => {
		const b = boot({ ...production, CLINIC_FAKE_PORT: "1" });
		expect(await b.exited).not.toBe(0);
		expect(b.out()).toContain("CLINIC_FAKE_PORT");
	}, 60_000);
	it("production with the development sign-in", async () => {
		const b = boot({ ...production, CLINIC_DEV_SIGNIN: "1", SCHEDULING_API_URL: "http://x.test" });
		expect(await b.exited).not.toBe(0);
		expect(b.out()).toContain("CLINIC_DEV_SIGNIN");
	}, 60_000);
});

describe("with the service URL and no fake, the console boots against the service", () => {
	it("serves, signs a development person in through the service's token flow, and shows their screens", async () => {
		const api = await startApi();
		const port = await freePort();
		const b = boot({
			PORT: String(port),
			SCHEDULING_API_URL: api.url,
			CLINIC_DEV_SIGNIN: "1",
		});
		try {
			const origin = `http://localhost:${port}`;
			for (let i = 0; i < 100 && !b.out().includes("http://localhost:"); i++)
				await new Promise((r) => setTimeout(r, 200));
			expect(b.out()).not.toContain("synthetic in-memory clinic");
			expect((await fetch(`${origin}/healthz`)).status).toBe(200);
			const signin = await (await fetch(`${origin}/dev/signin`)).text();
			expect(signin).toContain('data-person="rita"');
			const as = await fetch(`${origin}/dev/as`, {
				method: "POST",
				redirect: "manual",
				headers: { origin, "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({ subject: "rita" }),
			});
			const cookie = (as.headers.getSetCookie()[0] ?? "").split(";")[0] ?? "";
			const page = await fetch(`${origin}/requests`, { headers: { cookie } });
			expect(page.status).toBe(200);
			const html = await page.text();
			expect(html).toContain("Cereri");
			expect(html).toContain('href="/calendar"');
			expect(html).not.toContain('href="/audit"');
		} finally {
			await stop(b);
			await api.close();
		}
	}, 90_000);
});
