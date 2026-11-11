/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface DayNightProps {
	/** The brand's two themes, e.g. psizone-light and psizone-dark. */
	day: string;
	night: string;
	/** The theme the page was rendered in. */
	current: string;
	/** Accessible name of the group, and the two visible labels (already translated). */
	label: string;
	dayLabel: string;
	nightLabel: string;
	class?: string;
}

function choose(theme: string): string {
	return [
		`$pzTheme = '${theme}'`,
		`document.documentElement.dataset.theme = '${theme}'`,
		`document.cookie = 'theme=${theme};path=/;max-age=31536000;samesite=lax'`,
	].join("; ");
}

/** Day or night, said plainly: two segments, the current one pressed; the choice is remembered. */
export function DayNight({
	day,
	night,
	current,
	label,
	dayLabel,
	nightLabel,
	class: className,
}: DayNightProps): JSX.Element {
	return (
		<fieldset
			class={cx("pz-daynight", className)}
			aria-label={label}
			data-signals={`{pzTheme: '${current}'}`}
		>
			<button
				type="button"
				class="pz-daynight__option"
				aria-pressed={current === day ? "true" : "false"}
				data-attr:aria-pressed={`$pzTheme === '${day}' ? 'true' : 'false'`}
				data-on:click={choose(day)}
			>
				<svg
					width="16"
					height="16"
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
				<span>{dayLabel}</span>
			</button>
			<button
				type="button"
				class="pz-daynight__option"
				aria-pressed={current === night ? "true" : "false"}
				data-attr:aria-pressed={`$pzTheme === '${night}' ? 'true' : 'false'`}
				data-on:click={choose(night)}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
				</svg>
				<span>{nightLabel}</span>
			</button>
		</fieldset>
	);
}
