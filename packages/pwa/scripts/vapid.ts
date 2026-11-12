/**
 * Local development only: generates the estate's VAPID key pair into the repository's gitignored
 * `/.data/pwa/vapid.json` (mode 600) unless one is already there. Prints the public key only.
 * In the cluster the pair lives in OpenBao (`secret/apps/pwa/vapid`, docs/plans/pwa.md).
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { generateVAPIDKeys } from "web-push";
import { LOCAL_VAPID_FILE, readLocalVapid } from "../src/push/local-vapid";

const existing = readLocalVapid();
if (existing !== null) {
	console.log(`VAPID pair present at ${LOCAL_VAPID_FILE}; public key ${existing.publicKey}`);
} else {
	const dir = LOCAL_VAPID_FILE.replace(/\/[^/]+$/, "");
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
	const keys = generateVAPIDKeys();
	writeFileSync(
		LOCAL_VAPID_FILE,
		`${JSON.stringify({ publicKey: keys.publicKey, privateKey: keys.privateKey, subject: "mailto:ops@psizone.ro" }, null, "\t")}\n`,
		{ mode: 0o600 },
	);
	chmodSync(LOCAL_VAPID_FILE, 0o600);
	console.log(`VAPID pair written to ${LOCAL_VAPID_FILE} (mode 600); public key ${keys.publicKey}`);
}
