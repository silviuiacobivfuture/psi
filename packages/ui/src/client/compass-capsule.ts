/**
 * The capsule's page side, shared by the public compass and the admin's assistant (inlined once
 * right inside the capsule, see `build.ts`): the field grows with its text up to five lines
 * (Enter sends, Shift+Enter is a new line), the keyboard's inset and the visible height keep the
 * bar and the sheet above the on-screen keyboard, and dragging the sheet's handle down closes it.
 * Nothing here knows what the conversation is.
 */

/** The input grows with its text up to five lines; Enter sends, Shift+Enter is a new line. */
function compose(form: HTMLFormElement, input: HTMLTextAreaElement): void {
	const grow = (): void => {
		const style = window.getComputedStyle(input);
		const line = Number.parseFloat(style.lineHeight) || 22;
		const pad = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
		input.style.height = "auto";
		const height = Math.min(input.scrollHeight, line * 5 + pad);
		input.style.height = `${height}px`;
		input.style.overflowY = input.scrollHeight > height ? "auto" : "hidden";
		form.classList.toggle("is-multiline", input.scrollHeight > line * 1.5 + pad);
	};
	input.addEventListener("input", grow);
	input.addEventListener("keydown", (e) => {
		if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
		e.preventDefault();
		form.requestSubmit();
	});
	// Datastar sets the value itself (sent, restored, cleared): measure again after every signal patch.
	document.addEventListener("datastar-signal-patch", () => requestAnimationFrame(grow));
	window.addEventListener("resize", grow, { passive: true });
	requestAnimationFrame(grow);
}

/** The keyboard's inset and the visible height, so the bar and the sheet stay above the keyboard. */
function fitViewport(nav: HTMLElement, form: HTMLElement): void {
	const vv = window.visualViewport;
	const place = (): void => {
		if (vv === null) return;
		const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
		nav.style.setProperty("--pz-kb", `${Math.round(inset)}px`);
		nav.style.setProperty("--pz-vvh", `${Math.round(vv.height)}px`);
	};
	vv?.addEventListener("resize", place);
	vv?.addEventListener("scroll", place);
	place();
	new ResizeObserver(() => {
		nav.style.setProperty("--pz-bar-h", `${Math.round(form.getBoundingClientRect().height)}px`);
	}).observe(form);
}

/** Dragging the sheet's handle down by more than 80px collapses it (the close button's click). */
function dragToClose(nav: HTMLElement, sheet: HTMLElement): void {
	const handle = nav.querySelector<HTMLElement>(".pz-compass__handle");
	const close = nav.querySelector<HTMLElement>(".pz-compass__close");
	if (handle === null || close === null) return;
	let start: number | null = null;
	handle.addEventListener("pointerdown", (e) => {
		start = e.clientY;
		handle.setPointerCapture(e.pointerId);
	});
	handle.addEventListener("pointermove", (e) => {
		if (start === null) return;
		sheet.style.transform = `translateY(${Math.max(0, e.clientY - start)}px)`;
	});
	const end = (e: PointerEvent): void => {
		if (start === null) return;
		const moved = e.clientY - start;
		start = null;
		sheet.style.transform = "";
		if (moved > 80) close.click();
	};
	handle.addEventListener("pointerup", end);
	handle.addEventListener("pointercancel", end);
}

const nav = document.currentScript?.closest<HTMLElement>(".pz-compass") ?? null;
const sheet = nav?.querySelector<HTMLElement>(".pz-compass__sheet") ?? null;
const form = nav?.querySelector<HTMLFormElement>(".pz-compass__bar") ?? null;
const input = nav?.querySelector<HTMLTextAreaElement>("textarea.pz-compass__input") ?? null;
if (nav !== null && sheet !== null && form !== null) {
	fitViewport(nav, form);
	dragToClose(nav, sheet);
	if (input !== null) compose(form, input);
}

export {};
