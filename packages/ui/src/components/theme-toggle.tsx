/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";

export interface ThemeToggleProps {
	/** The brand's two themes, e.g. ["psizone-dark", "psizone-light"]. */
	themes: readonly [string, string];
	label: string;
}

/** Flips <html data-theme> between the brand's two themes and remembers the choice in a cookie. */
export function ThemeToggle({ themes, label }: ThemeToggleProps): JSX.Element {
	const [a, b] = themes;
	const flip = [
		"const h = document.documentElement",
		`h.dataset.theme = h.dataset.theme === '${a}' ? '${b}' : '${a}'`,
		"document.cookie = 'theme=' + h.dataset.theme + ';path=/;max-age=31536000;samesite=lax'",
	].join("; ");
	return (
		<button
			type="button"
			class="pz-btn pz-btn--ghost pz-btn--sm pz-theme-toggle"
			aria-label={label}
			data-on:click={flip}
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="4.5" />
				<path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4" />
			</svg>
		</button>
	);
}
