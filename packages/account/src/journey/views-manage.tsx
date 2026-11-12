/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { Button, StatusBadge, TextField } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { ConsentRecord, Profile, Purpose } from "../stores/types";
import type { JourneyKey, Say } from "./labels";
import { JOURNEY_PAGES, Section, TYPE, when } from "./views-shell";

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
						<h3 class={`text-title ${TYPE.heading}`}>{say(title)}</h3>
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
	signOutAction,
}: {
	say: Say;
	base: string;
	mismatch: boolean;
	/** This site keeps no reservations: export and erasure happen on the account's data page there. */
	elsewhere?: string;
	signOutAction: string;
}): JSX.Element {
	const security = (
		<Section title={say("account_security_title")}>
			<p class="text-body text-ink-muted">{say("account_security_text")}</p>
			<form method="post" action={signOutAction}>
				<Button type="submit" variant="outline">
					{say("account_sign_out")}
				</Button>
			</form>
		</Section>
	);
	if (elsewhere !== undefined) {
		return (
			<>
				{security}
				<Section title={say("account_data_title")}>
					<p class="text-body text-ink-muted">
						{say("account_data_elsewhere")}
					</p>
					<div>
						<Button href={elsewhere} variant="outline" arrow>
							{say("account_data_elsewhere_button")}
						</Button>
					</div>
				</Section>
			</>
		);
	}
	return (
		<>
			{security}
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
