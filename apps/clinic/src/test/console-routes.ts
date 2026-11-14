import { createAccount, memoryStores } from "@psi/account";
import { createApp } from "../app";
import { accountAuth } from "../auth";
import { createFakeNotifications } from "../notifications/fake";
import { createFakePort } from "../port/fake";
import { fixedPort } from "../port/source";
import { createConsolePwa } from "../pwa";

const ORIGIN = "http://clinic.test";

/** Every route the console serves (method and path template), read from the app itself as it is assembled. */
export function consoleRoutes(): ReadonlyArray<{ method: string; path: string }> {
	const account = createAccount({
		site: { slug: "clinic", key: "clinic", origin: ORIGIN, home: "/calendar" },
		stores: memoryStores(),
		onWarn: () => {},
		env: {},
	});
	const pwa = createConsolePwa(ORIGIN, account);
	const app = createApp({
		ports: fixedPort(createFakePort({ members: {} })),
		notifications: createFakeNotifications({ seeded: false }),
		viewAsSecret: "v".repeat(40),
		auth: accountAuth(account),
		origin: ORIGIN,
		pwa,
		mount: (h) => {
			account.mount(h);
			pwa.mount(h);
		},
	});
	return app.routes.map((r) => ({ method: r.method, path: r.path }));
}
