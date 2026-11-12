/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Topic } from "../push/types";
import { PWA_INIT, PWA_LISTEN, PWA_SIGNALS } from "./tools";

export interface NotifyPurpose {
	topic: Topic;
	label: string;
	hint: string;
}

export interface NotifyPanelLabels {
	notifyMe: string;
	stop: string;
	/** Shown beside a purpose this browser receives. */
	on: string;
	/** Booking updates need an account: the sign-in link's text. */
	signInFirst: string;
	unsupported: string;
	/** iPhone/iPad: push works only once the site is on the Home Screen (iOS 16.4+). */
	iosInstall: string;
	/** The server has no VAPID key (push off). */
	off: string;
	/** The browser refused (now or before): how to allow it again. */
	denied: string;
	failed: string;
	/** "Send a test notification" */
	test: string;
	tested: string;
	tooSoon: string;
	/** What a notification will never say. */
	privacy: string;
}

export interface NotifyPanelProps {
	purposes: ReadonlyArray<NotifyPurpose>;
	labels: NotifyPanelLabels;
	signedIn: boolean;
	signInHref: string;
}

const BTN = "pz-btn pz-btn--sm";
const has = (t: Topic) => `$pwaTopics.includes('${t}')`;
const CAN_ASK = "($pwaPush === 'default' || $pwaPush === 'granted')";

/**
 * One row per purpose, each with its own "Notify me": the browser's permission prompt follows
 * that press, never a page load. Booking updates are offered to signed-in people only; article
 * news to anyone. Every state the browser can be in says so in words, not colour.
 */
export function NotifyPanel({
	purposes,
	labels,
	signedIn,
	signInHref,
}: NotifyPanelProps): JSX.Element {
	return (
		<div
			class="flex flex-col gap-4"
			data-signals={PWA_SIGNALS}
			data-on:psipwa__window={PWA_LISTEN}
			data-init={PWA_INIT}
		>
			<ul class="flex flex-col gap-3">
				{purposes.map((p) => {
					const account = p.topic === "booking" && !signedIn;
					return (
						<li class="pz-edge flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface-1 p-5">
							<div class="min-w-0 flex-1 basis-64">
								<p class="text-body font-semibold text-ink">{p.label}</p>
								<p class="mt-1 text-body-sm text-ink-muted">{p.hint}</p>
								<p
									class="mt-2 text-body-sm text-ink"
									style={{ display: "none" }}
									data-show={has(p.topic)}
								>
									{labels.on}
								</p>
							</div>
							<div class="flex gap-2">
								{account ? (
									<a
										class={`${BTN} pz-btn--glass`}
										href={signInHref}
										data-show={`!${has(p.topic)}`}
									>
										{labels.signInFirst}
									</a>
								) : (
									<button
										type="button"
										class={`${BTN} pz-btn--primary`}
										style={{ display: "none" }}
										data-show={`${CAN_ASK} && !${has(p.topic)}`}
										data-attr:disabled="$pwaBusy"
										data-on:click={`window.psiPwa && window.psiPwa.subscribe('${p.topic}')`}
									>
										{labels.notifyMe}
									</button>
								)}
								<button
									type="button"
									class={`${BTN} pz-btn--glass`}
									style={{ display: "none" }}
									data-show={has(p.topic)}
									data-attr:disabled="$pwaBusy"
									data-on:click={`window.psiPwa && window.psiPwa.unsubscribe('${p.topic}')`}
								>
									{labels.stop}
								</button>
							</div>
						</li>
					);
				})}
			</ul>
			<div aria-live="polite" class="text-body-sm text-ink-muted">
				<p style={{ display: "none" }} data-show="$pwaPush === 'unsupported'">
					{labels.unsupported}
				</p>
				<p style={{ display: "none" }} data-show="$pwaPush === 'ios-install'">
					{labels.iosInstall}
				</p>
				<p style={{ display: "none" }} data-show="$pwaPush === 'off'">
					{labels.off}
				</p>
				<p style={{ display: "none" }} data-show="$pwaPush === 'denied' || $pwaError === 'denied'">
					{labels.denied}
				</p>
				<p style={{ display: "none" }} data-show="$pwaError === 'failed'">
					{labels.failed}
				</p>
				<p style={{ display: "none" }} data-show="$pwaError === 'too-soon'">
					{labels.tooSoon}
				</p>
				<p style={{ display: "none" }} data-show="$pwaTested">
					{labels.tested}
				</p>
			</div>
			<p style={{ display: "none" }} data-show="$pwaTopics.length > 0">
				<button
					type="button"
					class={`${BTN} pz-btn--glass`}
					data-on:click="window.psiPwa && window.psiPwa.test()"
				>
					{labels.test}
				</button>
			</p>
			<p class="text-body-sm text-ink-muted">{labels.privacy}</p>
		</div>
	);
}
