/**
 * The page side of psi's PWA, bundled by `scripts/build-bundles.ts` and served hashed under
 * /assets/pwa/. It registers the worker, keeps the install prompt for the "Install app" control,
 * and subscribes to push ONLY when a person presses "Notify me" (the permission prompt follows
 * that press, never a page load). State goes out as a `psipwa` window event that Datastar
 * signals listen to (`data-on:psipwa__window`); controls call `window.psiPwa.*`.
 */

type PushState =
	| "unsupported"
	| "ios-install"
	| "off"
	| "default"
	| "denied"
	| "granted";

interface PwaState {
	installable: boolean;
	ios: boolean;
	standalone: boolean;
	push: PushState;
	topics: string[];
	linked: boolean;
	busy: boolean;
	/** The last problem: `sign-in`, `denied`, `failed`, `too-soon`, or "". */
	error: string;
	/** True for a moment after a test notification was sent. */
	tested: boolean;
}

interface InstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isInstallPrompt(e: Event): e is InstallPromptEvent {
	return "prompt" in e && typeof Reflect.get(e, "prompt") === "function";
}

const meta = (name: string): string =>
	document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? "";
const VAPID = meta("psi-pwa-vapid");
const LOCALE = document.documentElement.lang === "en" ? "en" : "ro";
const standalone =
	window.matchMedia("(display-mode: standalone)").matches ||
	Reflect.get(navigator, "standalone") === true;
const ios =
	/iphone|ipad|ipod/i.test(navigator.userAgent) ||
	(navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
const pushCapable =
	"serviceWorker" in navigator &&
	"PushManager" in window &&
	"Notification" in window;

let deferred: InstallPromptEvent | null = null;
const state: PwaState = {
	installable: false,
	ios: ios && !standalone,
	standalone,
	push: !pushCapable
		? ios && !standalone
			? "ios-install"
			: "unsupported"
		: VAPID === ""
			? "off"
			: Notification.permission,
	topics: [],
	linked: false,
	busy: false,
	error: "",
	tested: false,
};

function emit(): void {
	window.dispatchEvent(new CustomEvent("psipwa", { detail: { ...state } }));
}

function set(patch: Partial<PwaState>): void {
	Object.assign(state, patch);
	emit();
}

function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
	const padded = (text + "=".repeat((4 - (text.length % 4)) % 4))
		.replace(/-/g, "+")
		.replace(/_/g, "/");
	const raw = atob(padded);
	const out = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

async function post(path: string, body: unknown): Promise<Response> {
	return fetch(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		credentials: "same-origin",
		body: JSON.stringify(body),
	});
}

async function current(): Promise<PushSubscription | null> {
	const reg = await navigator.serviceWorker.ready;
	return reg.pushManager.getSubscription();
}

function own(sub: PushSubscription): { endpoint: string; auth: string } {
	return { endpoint: sub.endpoint, auth: sub.toJSON().keys?.auth ?? "" };
}

function readTopics(data: unknown): { topics: string[]; linked: boolean } {
	const topics =
		typeof data === "object" && data !== null
			? Reflect.get(data, "topics")
			: undefined;
	const linked =
		typeof data === "object" && data !== null
			? Reflect.get(data, "linked")
			: undefined;
	return {
		topics: Array.isArray(topics)
			? topics.filter((t): t is string => typeof t === "string")
			: [],
		linked: linked === true,
	};
}

/** Sends the full topic set; an empty set forgets the subscription on both sides. */
async function save(sub: PushSubscription, topics: string[]): Promise<void> {
	const res = await post("/pwa/push/subscribe", {
		subscription: sub.toJSON(),
		topics,
		locale: LOCALE,
	});
	if (res.status === 401) return set({ error: "sign-in", busy: false });
	if (!res.ok) return set({ error: "failed", busy: false });
	const saved = readTopics(await res.json());
	if (saved.topics.length === 0) await sub.unsubscribe();
	set({ ...saved, error: "", busy: false });
}

const api = {
	emit,
	async install(): Promise<void> {
		if (deferred === null) return;
		await deferred.prompt();
		const choice = await deferred.userChoice;
		deferred = null;
		set({
			installable: false,
			standalone: choice.outcome === "accepted" || state.standalone,
		});
	},
	/** Called from a click: asks for permission (the browser's prompt) only now. */
	async subscribe(topic: string): Promise<void> {
		if (
			state.push === "unsupported" ||
			state.push === "ios-install" ||
			state.push === "off"
		)
			return;
		set({ busy: true, error: "" });
		try {
			const permission = await Notification.requestPermission();
			if (permission !== "granted")
				return set({ push: permission, busy: false, error: "denied" });
			const reg = await navigator.serviceWorker.ready;
			const sub =
				(await reg.pushManager.getSubscription()) ??
				(await reg.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: base64UrlToBytes(VAPID),
				}));
			set({ push: "granted" });
			await save(sub, [...new Set([...state.topics, topic])]);
		} catch {
			set({ busy: false, error: "failed" });
		}
	},
	async unsubscribe(topic: string): Promise<void> {
		set({ busy: true, error: "" });
		try {
			const sub = await current();
			if (sub === null) return set({ topics: [], busy: false });
			await save(
				sub,
				state.topics.filter((t) => t !== topic),
			);
		} catch {
			set({ busy: false, error: "failed" });
		}
	},
	async test(): Promise<void> {
		const sub = await current().catch(() => null);
		if (sub === null) return;
		const res = await post("/pwa/push/test", own(sub));
		set({
			tested: res.ok,
			error: res.status === 429 ? "too-soon" : res.ok ? "" : "failed",
		});
		if (res.ok) setTimeout(() => set({ tested: false }), 6000);
	},
};
Reflect.set(window, "psiPwa", api);

window.addEventListener("beforeinstallprompt", (e) => {
	if (!isInstallPrompt(e)) return;
	e.preventDefault();
	deferred = e;
	set({ installable: true });
});
window.addEventListener("appinstalled", () => {
	deferred = null;
	set({ installable: false, standalone: true });
});

/**
 * On a workstation (localhost, 127.0.0.1, ::1) there is no worker at all, and one left over from an
 * earlier run is unregistered with its caches: a dev server restarts constantly, and a worker would
 * answer with stale pages or the offline page in between.
 */
const local = ["localhost", "127.0.0.1", "[::1]"].includes(
	window.location.hostname,
);
if ("serviceWorker" in navigator && local) {
	navigator.serviceWorker
		.getRegistrations()
		.then(async (registrations) => {
			await Promise.all(registrations.map((r) => r.unregister()));
			const names = await caches.keys();
			await Promise.all(
				names
					.filter((n) => n.startsWith("psi-pwa-"))
					.map((n) => caches.delete(n)),
			);
		})
		.catch(() => undefined);
} else if ("serviceWorker" in navigator) {
	navigator.serviceWorker
		.register("/sw.js", { scope: "/", updateViaCache: "none" })
		.then(async () => {
			if (!pushCapable || VAPID === "" || Notification.permission !== "granted")
				return;
			const sub = await current();
			if (sub === null) return;
			const res = await post("/pwa/push/status", own(sub));
			if (res.ok) set(readTopics(await res.json()));
		})
		.catch(() => undefined);
}

// Datastar may initialise before or after this module: say the state now and once the page settles.
emit();
window.addEventListener("load", emit);
