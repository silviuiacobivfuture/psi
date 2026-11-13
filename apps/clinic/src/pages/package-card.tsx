import {
	Icon,
	InlineEdit,
	LedgerTable,
	Money,
	MoneyBar,
	ProgressRing,
	type RingSegment,
	Timeline,
	type TimelineItem,
} from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ledger } from "../domain/ledger";
import { CURRENCY, formatAmount, moneyInput } from "../domain/money";
import { packageUsage, paidBani, type Usage } from "../domain/usage";
import { dayLong, dayMonth, hhmm } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Appointment, Package, PaymentMethod, Service } from "../port/schema";

export type PackageField = "name" | "sessions" | "bonus" | "total" | "note";

const methodLabel = (method: PaymentMethod, locale: Locale): string => {
	const o = at(locale);
	switch (method) {
		case "cash":
			return m.method_cash({}, o);
		case "card":
			return m.method_card({}, o);
		case "transfer":
			return m.method_transfer({}, o);
		default: {
			const never: never = method;
			return never;
		}
	}
};

export interface PackageCardProps {
	clientId: string;
	pkg: Package;
	appointments: ReadonlyArray<Appointment>;
	services: ReadonlyArray<Service>;
	today: string;
	locale: Locale;
	/** The field just saved: it shows a quiet check. */
	saved?: PackageField;
}

function ringSegments(u: Usage): RingSegment[] {
	return [
		{ tone: "used", value: u.usedRegular },
		{ tone: "left", value: Math.max(0, u.sessions - u.usedRegular) },
		{ tone: "bonus-used", value: u.usedBonus },
		{ tone: "bonus-left", value: Math.max(0, u.bonus - u.usedBonus) },
	];
}

function timelineItems(u: Usage, services: ReadonlyArray<Service>, locale: Locale): TimelineItem[] {
	const o = at(locale);
	return u.timeline.map((a) => ({
		key: a.id,
		when: `${dayMonth(locale, a.date)}, ${hhmm(a.startMin)}`,
		title: services.find((s) => s.id === a.serviceId)?.name ?? "",
		status: a.status === "attended" || a.status === "no-show" ? a.status : null,
		statusLabel:
			a.status === "attended"
				? m.status_attended({}, o)
				: a.status === "no-show"
					? m.status_no_show({}, o)
					: m.pkg_planned({}, o),
		href: `/calendar?date=${a.date}`,
	}));
}

/** One package as a card: sessions ring, money, payments ledger, the sessions drawn, every value editable in place. */
export function PackageCard(p: PackageCardProps): JSX.Element {
	const { pkg, locale } = p;
	const o = at(locale);
	const u = packageUsage(pkg, p.appointments, p.today);
	const paid = paidBani(pkg);
	const l = ledger(pkg.totalBani, paid);
	const base = `/clients/${p.clientId}/packages/${pkg.id}`;
	const field = (f: PackageField) => ({
		id: `${pkg.id}-${f}`,
		action: `${base}/field/${f}`,
		save: m.inline_save({}, o),
		cancel: m.inline_cancel({}, o),
		hint: m.inline_hint({}, o),
		saved: p.saved === f,
		savedLabel: m.inline_saved({}, o),
	});
	const owedLabel = l.state === "overpaid" ? m.pkg_credit({}, o) : m.pkg_remaining({}, o);
	const owed = Math.abs(l.remainingBani);
	const total = u.sessions + u.bonus;
	const tone = l.state === "paid" ? "confirmed" : l.state === "overpaid" ? "attended" : "requested";
	const statusText =
		l.state === "paid"
			? m.pkg_status_paid({}, o)
			: l.state === "overpaid"
				? m.pkg_status_over({}, o)
				: m.pkg_status_due({}, o);
	const prefill = l.remainingBani > 0 ? moneyInput(l.remainingBani, locale) : "";
	const payKey = pkg.id.replace(/\W/g, "_");
	return (
		<article class="adm-card pk" id={`pk-${pkg.id}`} aria-labelledby={`pk-${pkg.id}-name`}>
			<header class="pk__head">
				<h3 class="pk__name" id={`pk-${pkg.id}-name`}>
					<InlineEdit
						{...field("name")}
						label={m.pkg_name({}, o)}
						value={pkg.name}
						display={pkg.name}
					/>
				</h3>
				<span class={`adm-pill adm-pill--${tone}`} data-state={l.state} data-testid="status">
					<Icon name={l.state === "paid" ? "check" : l.state === "overpaid" ? "plus" : "clock"} />
					{statusText}
				</span>
			</header>

			<div class="pk__grid">
				<div class="pk__ring">
					<ProgressRing
						segments={ringSegments(u)}
						label={m.pkg_ring_label({ left: u.left, total, bonus: u.bonus }, o)}
						primary={String(u.left)}
						secondary={m.pkg_ring_of({ total }, o)}
					/>
				</div>

				<div class="pk__facts">
					<p class="pk__left" data-testid="left">
						<strong>{m.pkg_left_of({ left: u.left, total }, o)}</strong>
					</p>
					{u.overBy > 0 ? (
						<p class="pk__over" role="status">
							{m.pkg_over_by({ n: u.overBy }, o)}
						</p>
					) : null}
					<p class="adm-muted">
						{u.next === null
							? m.pkg_next_none({}, o)
							: m.pkg_next(
									{
										date: `${dayLong(locale, u.next.date)}, ${hhmm(u.next.startMin)}`,
									},
									o,
								)}
					</p>
					<dl class="pk__counts">
						<div>
							<dt>{m.pkg_sessions({}, o)}</dt>
							<dd>
								<InlineEdit
									{...field("sessions")}
									kind="number"
									min={0}
									max={999}
									label={m.pkg_sessions({}, o)}
									value={String(pkg.sessions)}
									display={String(pkg.sessions)}
								/>
							</dd>
						</div>
						<div>
							<dt>{m.pkg_bonus({}, o)}</dt>
							<dd>
								<InlineEdit
									{...field("bonus")}
									kind="number"
									min={0}
									max={999}
									label={m.pkg_bonus({}, o)}
									value={String(pkg.bonus)}
									display={String(pkg.bonus)}
								/>
							</dd>
						</div>
						<div>
							<dt>{m.pkg_used({}, o)}</dt>
							<dd data-testid="used">{u.used}</dd>
						</div>
					</dl>
				</div>

				<div class="pk__money" id={`pk-${pkg.id}-money`}>
					<dl class="pk__lines">
						<div>
							<dt>{m.pkg_total({}, o)}</dt>
							<dd>
								<InlineEdit
									{...field("total")}
									kind="money"
									label={m.pkg_total({}, o)}
									value={moneyInput(pkg.totalBani, locale)}
									display={
										<Money value={formatAmount(pkg.totalBani, locale)} currency={CURRENCY} />
									}
								/>
							</dd>
						</div>
						<div>
							<dt>{m.pkg_paid({}, o)}</dt>
							<dd>
								<Money value={formatAmount(paid, locale)} currency={CURRENCY} tone="success" />
							</dd>
						</div>
						<div>
							<dt>{owedLabel}</dt>
							<dd data-testid="remaining">
								<Money
									value={formatAmount(owed, locale)}
									currency={CURRENCY}
									tone={l.state === "partial" || l.state === "unpaid" ? "danger" : "default"}
								/>
							</dd>
						</div>
					</dl>
					<MoneyBar
						paid={paid}
						total={pkg.totalBani}
						label={m.pkg_bar_label(
							{
								paid: formatAmount(paid, locale),
								total: formatAmount(pkg.totalBani, locale),
							},
							o,
						)}
					/>
				</div>

				<section class="pk__ledger" aria-labelledby={`pk-${pkg.id}-pay`}>
					<h4 class="pk__h" id={`pk-${pkg.id}-pay`}>
						{m.pkg_ledger({}, o)}
					</h4>
					<LedgerTable
						caption={m.pkg_ledger({}, o)}
						empty={m.pay_none({}, o)}
						columns={[
							{ key: "date", label: m.pay_date({}, o), slot: "start" },
							{
								key: "amount",
								label: m.pay_amount({}, o),
								align: "end",
								slot: "end",
							},
							{ key: "method", label: m.pay_method({}, o) },
							{ key: "by", label: m.pay_by({}, o) },
						]}
						rows={[...pkg.payments]
							.sort((a, b) => b.date.localeCompare(a.date))
							.map((x) => ({
								key: x.id,
								cells: {
									date: dayMonth(locale, x.date),
									amount: <Money value={formatAmount(x.amountBani, locale)} currency={CURRENCY} />,
									method: methodLabel(x.method, locale),
									by: x.recordedBy,
								},
							}))}
						footer={
							<form
								class="pk__pay"
								data-signals={JSON.stringify({
									pay: { [payKey]: { a: prefill, k: "cash", d: p.today } },
								})}
								data-on:submit__prevent={`@post('${base}/payments')`}
							>
								<label class="adm-field">
									<span>{m.pay_amount({}, o)}</span>
									<input
										class="adm-input pk__amount"
										type="text"
										inputmode="decimal"
										autocomplete="off"
										{...{ [`data-bind:pay.${payKey}.a`]: "" }}
									/>
								</label>
								<label class="adm-field">
									<span>{m.pay_method({}, o)}</span>
									<select class="adm-input" {...{ [`data-bind:pay.${payKey}.k`]: "" }}>
										{(["cash", "card", "transfer"] as const).map((k) => (
											<option key={k} value={k}>
												{methodLabel(k, locale)}
											</option>
										))}
									</select>
								</label>
								<label class="adm-field">
									<span>{m.pay_date({}, o)}</span>
									<input class="adm-input" type="date" {...{ [`data-bind:pay.${payKey}.d`]: "" }} />
								</label>
								<button class="adm-btn adm-btn--primary pk__add" type="submit">
									<Icon name="plus" />
									{m.pay_add({}, o)}
								</button>
							</form>
						}
					/>
				</section>

				<section class="pk__timeline" aria-labelledby={`pk-${pkg.id}-tl`}>
					<h4 class="pk__h" id={`pk-${pkg.id}-tl`}>
						{m.pkg_timeline({}, o)}
					</h4>
					<Timeline
						label={m.pkg_timeline({}, o)}
						empty={m.pkg_timeline_none({}, o)}
						items={timelineItems(u, p.services, locale)}
					/>
				</section>
			</div>

			<footer class="pk__note">
				<InlineEdit
					{...field("note")}
					kind="textarea"
					class="pk__noteedit"
					label={m.pkg_note({}, o)}
					value={pkg.note}
					display={
						pkg.note === "" ? (
							<span class="pk__notelink">{m.pkg_note_add({}, o)}</span>
						) : (
							<span class="pk__notetext">{pkg.note}</span>
						)
					}
				/>
			</footer>
		</article>
	);
}
