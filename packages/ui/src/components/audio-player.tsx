/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface AudioPlayerProps {
	/** Unique on the page; names the element and its signals. */
	id: string;
	title: string;
	src: string;
	/** Seconds. */
	duration: number;
	meta?: string;
	/** Id of the element that describes what the listener will hear (the transcript equivalent). */
	describedBy?: string;
	playLabel: string;
	pauseLabel: string;
	class?: string;
}

const BARS = Array.from(
	{ length: 48 },
	(_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.31)),
);

function clock(seconds: number): string {
	const t = Math.max(0, Math.round(seconds));
	return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Session audio. Never autoplays; play state and progress are Datastar signals fed by the element. */
export function AudioPlayer({
	id,
	title,
	src,
	duration,
	meta,
	describedBy,
	playLabel,
	pauseLabel,
	class: className,
}: AudioPlayerProps): JSX.Element {
	const s = id.replace(/[^a-zA-Z0-9]/g, "");
	const playing = `$${s}Playing`;
	const time = `$${s}Time`;
	return (
		<div
			id={id}
			class={cx("pz-player", className)}
			data-signals={`{${s}Playing: false, ${s}Time: 0}`}
			data-class:is-playing={playing}
		>
			<audio
				data-ref={`${s}Audio`}
				src={src}
				preload="none"
				data-on:play={`${playing} = true`}
				data-on:pause={`${playing} = false`}
				{...{ "data-on:timeupdate__throttle.250ms": `${time} = evt.target.currentTime` }}
			/>
			<button
				type="button"
				class="pz-player__play"
				aria-label={playLabel}
				aria-describedby={describedBy}
				data-attr:aria-label={`${playing} ? ${JSON.stringify(pauseLabel)} : ${JSON.stringify(playLabel)}`}
				data-on:click={`$${s}Audio.paused ? $${s}Audio.play() : $${s}Audio.pause()`}
			>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="currentColor"
					aria-hidden="true"
					data-show={`!${playing}`}
				>
					<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
				</svg>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="currentColor"
					aria-hidden="true"
					data-show={playing}
					style={{ display: "none" }}
				>
					<rect x="6" y="5" width="4" height="14" rx="1" />
					<rect x="14" y="5" width="4" height="14" rx="1" />
				</svg>
			</button>
			<div class="pz-player__body">
				<div class="pz-player__head">
					<span class="pz-player__title">{title}</span>
					{meta ? <span class="pz-player__meta">{meta}</span> : null}
				</div>
				<div class="pz-player__wave" aria-hidden="true">
					{BARS.map((b, k) => (
						<span
							style={{ height: `${Math.round(b * 100)}%` }}
							data-class:on={`${time} / ${duration} > ${(k / BARS.length).toFixed(3)}`}
						/>
					))}
				</div>
				<div class="pz-player__time">
					<span
						data-text={`Math.floor(${time} / 60) + ':' + String(Math.floor(${time} % 60)).padStart(2, '0')`}
					>
						0:00
					</span>
					<span>{clock(duration)}</span>
				</div>
			</div>
		</div>
	);
}
