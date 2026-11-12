/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { Button, StatusBadge, TextField } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { ConsentRecord, Profile, Purpose } from "../stores/types";
import type { JourneyKey, Say } from "./labels";
import type { TimelineEvent, TimelineKind } from "./ports";
import { JOURNEY_PAGES, Section, when } from "./views-shell";

const EVENT_KEY: Readonly<Record<TimelineKind, JourneyKey>> = {
	booking: "account_event_booking",
	consent_granted: "account_event_consent_granted",
	consent_withdrawn: "account_event_consent_withdrawn",
	saved: "account_event_saved",
	conversation: "account_event_conversation",
};

export const PURPOSE_KEYS: Readonly<
	Record<Purpose, readonly [JourneyKey, JourneyKey]>
> = {
	guide_memory: [
		"account_purpose_guide_memory_title",
		"account_purpose_guide_memory_text",
	],
	booking_contact: [
		"account_purpose_booking_contact_title",
		"account_purpose_booking_contact_text",
	],
	programme_progress: [
		"account_purpose_programme_progress_title",
		"account_purpose_programme_progress_text",
	],
};

/** /cont: what happened lately, newest first, and whatever the site adds (the blog's reading list). */
export function HomeBody({
	say,
	locale,
	timeline,
	extra,
}: {
	say: Say;
	locale: "ro" | "en";
	timeline: ReadonlyArray<TimelineEvent>;
	extra?: Child;
}): JSX.Element {
	return (
		<>
			{extra}
			<Section title={say("account_timeline_title")}>
				{timeline.length === 0 ? (
					<p class="text-body text-ink-muted">
						{say("account_timeline_empty")}
					</p>
				) : (
					<ol class="flex flex-col divide-y divide-line" data-timeline>
						{timeline.map((e) => (
							<li class="flex flex-wrap items-baseline justify-between gap-2 py-3">
								<span class="text-body text-ink">
									{say(EVENT_KEY[e.kind])}
									{e.detail === "" ? null : (
										<>
											{" · "}
											{e.href === undefined ? (
												<span class="text-ink-muted">{e.detail}</span>
											) : (
												<a class="text-ink-muted underline" href={e.href}>
													{e.detail}
												</a>
											)}
										</>
									)}
								</span>
								<time
									class="text-body-sm text-ink-muted"
									datetime={new Date(e.at).toISOString()}
								>
									{when(locale, e.at)}
								</time>
							</li>
						))}
					</ol>
				)}
			</Section>
		</>
	);
}

/** /cont/profil: name, phone, how to reach the person, language. The e-mail is Authentik's, shown only. */
export function ProfileBody({
	say,
	base,
	email,
	profile,
	invalid,
}: {
	say: Say;
	base: string;
	email: string | null;
	profile: Omit<Profile, "updatedAt">;
	invalid: boolean;
}): JSX.Element {
	const radio = (
		name: string,
		value: string,
		checked: boolean,
		label: string,
	) => (
		<label class="flex items-center gap-2 text-body text-ink">
			<input type="radio" name={name} value={value} checked={checked} />
			{label}
		</label>
	);
	return (
		<Section title={say("account_profile_title")}>
			<p class="text-body text-ink-muted">{say("account_profile_lead")}</p>
			{invalid ? (
				<StatusBadge tone="danger">
					{say("account_profile_invalid")}
				</StatusBadge>
			) : null}
			<form
				method="post"
				action={`${base}${JOURNEY_PAGES.profile}`}
				class="flex flex-col gap-4"
			>
				<TextField
					id="account-name"
					name="displayName"
					label={say("account_profile_name")}
					autocomplete="name"
					value={profile.displayName ?? ""}
				/>
				<div>
					<p class="text-body-sm text-ink-muted">
						{say("account_profile_email")}
					</p>
					<p class="text-body text-ink">{email ?? ""}</p>
					<p class="text-body-sm text-ink-muted">
						{say("account_profile_email_note")}
					</p>
				</div>
				<TextField
					id="account-phone"
					name="phone"
					type="tel"
					label={say("account_profile_phone")}
					value={profile.phone ?? ""}
				/>
				<fieldset class="flex flex-col gap-2">
					<legend class="text-body-sm text-ink-muted">
						{say("account_profile_contact")}
					</legend>
					{radio(
						"preferredContact",
						"email",
						profile.preferredContact === "email",
						say("account_profile_contact_email"),
					)}
					{radio(
						"preferredContact",
						"phone",
						profile.preferredContact === "phone",
						say("account_profile_contact_phone"),
					)}
				</fieldset>
				<fieldset class="flex flex-col gap-2">
					<legend class="text-body-sm text-ink-muted">
						{say("account_profile_language")}
					</legend>
					{radio(
						"language",
						"ro",
						profile.language === "ro",
						say("account_lang_ro"),
					)}
					{radio(
						"language",
						"en",
						profile.language === "en",
						say("account_lang_en"),
					)}
				</fieldset>
				<div>
					<Button type="submit">{say("account_profile_save")}</Button>
				</div>
			</form>
		</Section>
	);
}

/** /cont/consimtaminte: one card per purpose, with its history; grant and withdraw are explicit acts. */
export function ConsentsBody({
	say,
	base,
	locale,
	records,
	purposes,
}: {
	say: Say;
	base: string;
	locale: "ro" | "en";
	records: ReadonlyArray<ConsentRecord>;
	purposes: ReadonlyArray<Purpose>;
}): JSX.Element {
	return (
		<Section title={say("account_consents_title")}>
			<p class="text-body text-ink-muted">{say("account_consents_lead")}</p>
			{purposes.map((purpose) => {
				const mine = records.filter((r) => r.purpose === purpose);
				const open = mine.some((r) => r.withdrawnAt === null);
				const [title, text] = PURPOSE_KEYS[purpose];
				return (
					<div
						class="rounded-2xl border border-line p-4"
						data-purpose={purpose}
					>
						<h3 class="text-body-lg text-ink">{say(title)}</h3>
						<p class="mt-1 text-body text-ink-muted">{say(text)}</p>
						<ul class="mt-2 text-body-sm text-ink-muted">
							{mine.length === 0 ? (
								<li>{say("account_consent_never")}</li>
							) : null}
							{mine.map((r) => (
								<li>
									{`${say("account_consent_granted_on")} ${when(locale, r.grantedAt)}`}
									{r.withdrawnAt === null
										? null
										: ` · ${say("account_consent_withdrawn_on")} ${when(locale, r.withdrawnAt)}`}
								</li>
							))}
						</ul>
						<form
							method="post"
							action={`${base}${JOURNEY_PAGES.consents}`}
							class="mt-3"
						>
							<input type="hidden" name="purpose" value={purpose} />
							<input
								type="hidden"
								name="action"
								value={open ? "withdraw" : "grant"}
							/>
							<Button
								type="submit"
								size="sm"
								variant={open ? "outline" : "primary"}
							>
								{say(
									open ? "account_consent_withdraw" : "account_consent_grant",
								)}
							</Button>
						</form>
					</div>
				);
			})}
		</Section>
	);
}

/** /cont/date: the JSON export, and erasure behind a typed confirmation. */
export function DataBody({
	say,
	base,
	mismatch,
	elsewhere,
}: {
	say: Say;
	base: string;
	mismatch: boolean;
	/** This site keeps no reservations: export and erasure happen on the account's data page there. */
	elsewhere?: string;
}): JSX.Element {
	if (elsewhere !== undefined) {
		return (
			<Section title={say("account_data_title")}>
				<p class="text-body text-ink-muted">{say("account_data_elsewhere")}</p>
				<div>
					<Button href={elsewhere} variant="outline" arrow>
						{say("account_data_elsewhere_button")}
					</Button>
				</div>
			</Section>
		);
	}
	return (
		<>
			<Section title={say("account_export_title")}>
				<p class="text-body text-ink-muted">{say("account_export_text")}</p>
				<div>
					<Button
						href={`${base}${JOURNEY_PAGES.data}/export`}
						variant="outline"
					>
						{say("account_export_button")}
					</Button>
				</div>
			</Section>
			<Section title={say("account_erase_title")}>
				<p class="text-body text-ink-muted">{say("account_erase_text")}</p>
				{mismatch ? (
					<StatusBadge tone="danger">
						{say("account_erase_mismatch")}
					</StatusBadge>
				) : null}
				<form
					method="post"
					action={`${base}${JOURNEY_PAGES.data}/sterge`}
					class="flex flex-col gap-4"
				>
					<TextField
						id="account-erase-word"
						name="confirm"
						label={`${say("account_erase_confirm_label")} ${say("account_erase_word")}`}
					/>
					<div>
						<Button type="submit" variant="outline">
							{say("account_erase_button")}
						</Button>
					</div>
				</form>
			</Section>
		</>
	);
}
