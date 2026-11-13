import { Banner, EmptyState, Icon, Sheet } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { todayIso } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Appointment, Client, Package, Service } from "../port/schema";
import { PackageCard } from "./package-card";

export interface PackagesView {
	client: Client;
	packages: ReadonlyArray<Package>;
	appointments: ReadonlyArray<Appointment>;
	services: ReadonlyArray<Service>;
	notice: "invalid" | "made" | null;
}

/** The client's packages: a card each, and the "new package" action. */
export function PackagesTab({ view, locale }: { view: PackagesView; locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<div class="adm-stack pk-list">
			{view.notice === "invalid" ? (
				<Banner tone="error" icon="alert">
					{m.pkg_new_invalid({}, o)}
				</Banner>
			) : null}
			{view.notice === "made" ? (
				<Banner tone="info" icon="check">
					{m.pkg_created({}, o)}
				</Banner>
			) : null}
			<div class="adm-row pk-list__bar">
				<h3 class="adm-h2">{m.packages_title({}, o)}</h3>
				<button type="button" class="adm-btn adm-btn--primary" data-on:click="$newPkg = true">
					<Icon name="plus" />
					{m.pkg_new({}, o)}
				</button>
			</div>
			{view.packages.length === 0 ? (
				<EmptyState
					icon="package"
					title={m.packages_none({}, o)}
					text={m.packages_none_hint({}, o)}
				/>
			) : (
				view.packages.map((p) => (
					<PackageCard
						key={p.id}
						clientId={view.client.id}
						pkg={p}
						appointments={view.appointments}
						services={view.services}
						today={todayIso()}
						locale={locale}
					/>
				))
			)}
		</div>
	);
}

/** The new-package sheet; lives in the page's overlays. */
export function NewPackageSheet({
	client,
	services,
	locale,
}: {
	client: Client;
	services: ReadonlyArray<Service>;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	return (
		<Sheet signal="newPkg" title={m.pkg_new({}, o)} closeLabel={m.close({}, o)}>
			<form method="post" action={`/clients/${client.id}/packages`} class="adm-stack">
				<label class="adm-field">
					<span>{m.pkg_name({}, o)}</span>
					<input
						class="adm-input"
						name="name"
						type="text"
						required
						maxlength={120}
						list="pk-names"
					/>
					<datalist id="pk-names">
						{services.map((s) => (
							<option key={s.id} value={s.name} />
						))}
					</datalist>
				</label>
				<div class="pk-new__nums">
					<label class="adm-field">
						<span>{m.pkg_sessions({}, o)}</span>
						<input
							class="adm-input"
							name="sessions"
							type="number"
							min={0}
							max={999}
							required
							inputmode="numeric"
						/>
					</label>
					<label class="adm-field">
						<span>{m.pkg_bonus({}, o)}</span>
						<input
							class="adm-input"
							name="bonus"
							type="number"
							min={0}
							max={999}
							value="0"
							inputmode="numeric"
						/>
					</label>
					<label class="adm-field">
						<span>{m.pkg_total({}, o)}</span>
						<input
							class="adm-input"
							name="total"
							type="text"
							required
							inputmode="decimal"
							autocomplete="off"
						/>
					</label>
				</div>
				<div class="adm-row">
					<button class="adm-btn adm-btn--primary" type="submit">
						{m.pkg_create({}, o)}
					</button>
					<button class="adm-btn" type="button" data-on:click="$newPkg = false">
						{m.cancel({}, o)}
					</button>
				</div>
			</form>
		</Sheet>
	);
}
