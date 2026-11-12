/**
 * Ensures one read-only service user per brand site, each holding an API key, for local
 * development (`pnpm --filter @psi/cms ensure:site-readers`). Idempotent: an existing user gets a
 * fresh key. The keys are written to the file named by `SERVICE_KEYS_OUT` (mode 600), never to
 * the console. Read access itself comes from `CMS_ROLE_ASSIGNMENTS` (`<email>=cms:reader@<brand>`);
 * this script grants nothing. In the estate the same users are created once by an admin and their
 * keys go to OpenBao (`secret/apps/<site>/env#CMS_API_KEY`).
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import config from "@payload-config";
import { live } from "@psi/content";
import { getPayload } from "payload";
import { z } from "zod";

const SITES = live(["psizone", "eqsync", "hemisync"] as const);
const DOMAIN = "service.psizone.test";

const Env = z.object({ SERVICE_KEYS_OUT: z.string().min(1) });
const { SERVICE_KEYS_OUT } = Env.parse({ SERVICE_KEYS_OUT: process.env.SERVICE_KEYS_OUT });

const payload = await getPayload({ config });
const lines: string[] = [];
for (const site of SITES) {
	const email = `${site}-reader@${DOMAIN}`;
	const apiKey = randomBytes(32).toString("hex");
	const found = await payload.find({
		collection: "users",
		where: { email: { equals: email } },
		limit: 1,
		overrideAccess: true,
	});
	const existing = found.docs[0];
	if (existing === undefined) {
		await payload.create({
			collection: "users",
			data: { email, password: randomBytes(24).toString("hex"), enableAPIKey: true, apiKey },
			overrideAccess: true,
		});
	} else {
		await payload.update({
			collection: "users",
			id: existing.id,
			data: { enableAPIKey: true, apiKey },
			overrideAccess: true,
		});
	}
	lines.push(`${site} ${email} ${apiKey}`);
}
writeFileSync(SERVICE_KEYS_OUT, `${lines.join("\n")}\n`, { mode: 0o600 });
process.stdout.write(`site readers ensured: ${SITES.join(", ")}\n`);
process.exit(0);
