import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { mountControl } from "./control";

// The server itself reads Datastar through `import.meta.resolve`, which vitest does not provide:
// the control plane is mounted the same way, on a fresh app.
// A test-only signing secret: with one, an unsigned call is refused (401), never served.
process.env.PSI_CONTROL_SECRET = "test-control-secret-".padEnd(40, "x");
const app = new Hono({ strict: false });
mountControl(app);

describe("eqsync and the control plane", () => {
	it("sends /admin and /en/admin to the control plane with eqsync chosen", async () => {
		for (const path of ["/admin", "/en/admin"]) {
			const r = await app.request(path);
			expect(r.status).toBe(302);
			expect(r.headers.get("location")).toMatch(/\/admin\/platform\?brand=eqsync$/);
		}
	});

	it("never answers /__control unsigned", async () => {
		const r = await app.request("/__control/status");
		expect(r.status).toBe(401);
	});
});
