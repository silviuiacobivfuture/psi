/**
 * The staff assistant's page side, inlined once beside the panel (see `client.generated.ts`, built
 * by `scripts/build-staff-client.ts`). It is NOT part of the visitor sites' script: Datastar owns
 * the signals and the requests; this keeps what a panel needs from the browser:
 *
 * - Ctrl/Cmd+K toggles the panel (through the trigger button, so the signal stays the one truth),
 *   Escape closes it, and focus goes to the field on open and back to the trigger on close;
 * - Enter sends, Shift+Enter is a new line; the field grows with its text;
 * - the log follows the newest message unless the person scrolled up to read (in the capsule, the
 *   sheet's body is what scrolls; its keys, field and keyboard fit are the capsule's own script);
 * - on a phone the panel's height follows the visual viewport, so the keyboard never hides the field.
 */
const panel = document.getElementById("staff-assistant");
const trigger = document.querySelector("[data-staff-trigger]");
const log = document.getElementById("staff-log");
const field = panel?.querySelector("textarea");

function isOpen(): boolean {
	return panel?.classList.contains("is-open") === true;
}

function toggle(): void {
	if (trigger instanceof HTMLElement) trigger.click();
}

// The side panel's own keys; the capsule has its own, written in its markup (it has no `#staff-assistant`).
if (panel !== null) {
	document.addEventListener("keydown", (event) => {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
			event.preventDefault();
			toggle();
		} else if (event.key === "Escape" && isOpen()) {
			toggle();
		}
	});
}

if (panel instanceof HTMLElement) {
	new MutationObserver(() => {
		if (isOpen()) {
			window.setTimeout(() => field?.focus(), 30);
		} else if (document.activeElement && panel.contains(document.activeElement)) {
			if (trigger instanceof HTMLElement) trigger.focus();
		}
	}).observe(panel, { attributes: true, attributeFilter: ["class"] });
}

if (field instanceof HTMLTextAreaElement) {
	const grow = (): void => {
		field.style.height = "auto";
		field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
	};
	field.addEventListener("input", grow);
	field.addEventListener("keydown", (event) => {
		if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			if (field.value.trim() !== "") field.form?.requestSubmit();
		}
	});
	field.addEventListener("blur", grow);
	// Not the style attribute: `grow` writes it, and an observer of its own write never lets the page breathe.
	new MutationObserver(grow).observe(field, {
		attributes: true,
		attributeFilter: ["class", "rows"],
	});
}

if (log instanceof HTMLElement) {
	// The panel's log scrolls itself; in the capsule, the sheet's body does.
	const scroller = log.closest<HTMLElement>(".pz-compass__body") ?? log;
	let pinned = true;
	scroller.addEventListener("scroll", () => {
		pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
	});
	new MutationObserver(() => {
		if (pinned) scroller.scrollTop = scroller.scrollHeight;
	}).observe(log, { childList: true, subtree: true, characterData: true });
}

if (panel instanceof HTMLElement && window.visualViewport) {
	const viewport = window.visualViewport;
	const fitHeight = (): void => {
		panel.style.setProperty("--sa-vh", `${viewport.height}px`);
	};
	viewport.addEventListener("resize", fitHeight);
	fitHeight();
}
