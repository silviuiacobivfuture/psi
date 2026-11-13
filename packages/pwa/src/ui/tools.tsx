/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";

export interface PwaToolsLabels {
	/** "Install app" */
	install: string;
	/** "Add to Home Screen" (iOS, where no install prompt exists). */
	iosTitle: string;
	/** The two taps: Share, then Add to Home Screen. */
	iosSteps: string;
	/** "Notifications" */
	notifications: string;
}

export interface PwaToolsProps {
	labels: PwaToolsLabels;
	/** The notifications page in this locale; absent while push is off (no link is shown). */
	notificationsHref?: string;
	/** False hides the install invitation and the iOS note (a site's `installPrompt` setting). */
	install?: boolean;
	/** Rows of a menu (the console's account menu): the entries take the menu's own row style, not a button's. */
	menu?: boolean;
}

/** The Datastar wiring every PWA control shares: the client's `psipwa` event fills these signals. */
export const PWA_SIGNALS =
	"{pwaInstallable: false, pwaIos: false, pwaStandalone: false, pwaPush: 'unsupported', pwaTopics: [], pwaLinked: false, pwaBusy: false, pwaError: '', pwaTested: false}";
export const PWA_LISTEN = [
	"$pwaInstallable = evt.detail.installable",
	"$pwaIos = evt.detail.ios",
	"$pwaStandalone = evt.detail.standalone",
	"$pwaPush = evt.detail.push",
	"$pwaTopics = evt.detail.topics",
	"$pwaLinked = evt.detail.linked",
	"$pwaBusy = evt.detail.busy",
	"$pwaError = evt.detail.error",
	"$pwaTested = evt.detail.tested",
].join("; ");
export const PWA_INIT = "window.psiPwa && window.psiPwa.emit()";

const BUTTON = "pz-btn pz-btn--glass pz-btn--sm";

/** The install row's icon in the console's menu, drawn like the console's own (24px stroke, currentColor). */
function DownloadGlyph(): JSX.Element {
	return (
		<svg
			class="adm-icon"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />
		</svg>
	);
}

/**
 * The Compass's quiet tools: "Install app" appears only once the browser says the site can be
 * installed (`beforeinstallprompt`); on iPhone and iPad, which have no such prompt, a short
 * "Add to Home Screen" note instead; and, while push is on, a link to the notifications page. No pop-up.
 */
export function PwaTools({
	labels,
	notificationsHref,
	install = true,
	menu = false,
}: PwaToolsProps): JSX.Element {
	const button = menu ? "adm-menu__item" : BUTTON;
	return (
		<span
			class="contents"
			data-signals={PWA_SIGNALS}
			data-on:psipwa__window={PWA_LISTEN}
			data-init={PWA_INIT}
		>
			{install ? (
				<>
					<button
						type="button"
						class={button}
						style={{ display: "none" }}
						data-show="$pwaInstallable && !$pwaStandalone"
						data-on:click="window.psiPwa && window.psiPwa.install()"
					>
						{menu ? <DownloadGlyph /> : null}
						{labels.install}
					</button>
					<details class="pz-pwa-ios w-full" style={{ display: "none" }} data-show="$pwaIos">
						<summary class={`${button} cursor-pointer list-none`}>{labels.iosTitle}</summary>
						<p class="mt-2 text-body-sm text-ink-muted">{labels.iosSteps}</p>
					</details>
				</>
			) : null}
			{notificationsHref !== undefined ? (
				<a class={button} href={notificationsHref}>
					{labels.notifications}
				</a>
			) : null}
		</span>
	);
}
