/**
 * Local development: sends one real `notify()` event through the same store and VAPID pair the dev
 * servers use, and prints the report (never a key, never an endpoint).
 *
 *   pnpm --filter @psi/pwa notify '{"kind":"booking.confirmed","accountHash":"…"}'
 *   pnpm --filter @psi/pwa notify --account-of <subject> booking.confirmed
 *
 * Run it with the app's env file (`--env-file=../../apps/psizone-web/.env`) when the sites keep
 * subscriptions in the account database; without one it reads the repository's /.data/pwa store.
 */
import { accountHashOf } from "@psi/scheduling";
import { readPushConfig } from "../src/push/config";
import { createNotifier } from "../src/push/notifier";
import { webPushTransport } from "../src/push/transport";
import { NotifyEventSchema } from "../src/push/types";

const args = process.argv.slice(2);
const raw =
	args[0] === "--account-of" && args[1] !== undefined && args[2] !== undefined
		? { kind: args[2], accountHash: accountHashOf(args[1]) }
		: JSON.parse(args[0] ?? "null");
const event = NotifyEventSchema.parse(raw);
const config = readPushConfig();
if (config.vapid === null) throw new Error(`push is off: ${config.off ?? "no VAPID pair"}`);
const store = await config.store();
const notifier = createNotifier({ store, transport: webPushTransport(config.vapid) });
console.log(`store: ${config.storage}`);
console.log(JSON.stringify(await notifier.notify(event)));
await store.close();
