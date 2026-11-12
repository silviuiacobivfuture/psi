import type { PersonView } from "@psi/cms-client";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import type { ReactElement } from "react";
import { brandsFor } from "../../authz/access";
import type { Brand } from "../../authz/types";
import { scopeFor } from "../../platform/access";
import { log } from "../../platform/http";
import { SECTIONS } from "../../platform/sections";
import { controlFor } from "../../platform/services";
import { cell, Shell, sayer } from "../shell";
import {
	BrandTabs,
	box,
	buttonStyle,
	Flash,
	inputStyle,
	muted,
	param,
	problemWord,
	type Say,
	Table,
	word,
} from "./parts";

/**
 * /admin/platform/accounts — the privacy officer's page: find a person by e-mail (POSTed, so the
 * address never sits in a URL), see their consents, reservations and saved articles, and export or
 * erase on their behalf. Every person shown is appended to the editorial log (subject only). No
 * conversation text and nothing clinical ever reaches this page.
 */
const day = (iso: string) => iso.slice(0, 16).replace("T", " ");

function Person({
	p,
	say,
	brand,
	mayErase,
}: {
	p: PersonView;
	say: Say;
	brand: Brand;
	mayErase: boolean;
}): ReactElement {
	return (
		<section style={box}>
			<h2 style={{ marginTop: 0 }}>
				{p.account.name ?? p.account.email ?? p.account.subject}{" "}
				<code style={{ ...muted, fontSize: "0.6em" }}>{p.account.subject}</code>
			</h2>
			<p style={muted}>
				{p.account.email} · {say("accCreated")} {day(p.account.createdAt)} · {say("accLastSeen")}{" "}
				{day(p.account.lastSeenAt)}
			</p>
			<h3>{say("consents")}</h3>
			<Table head={[say("topic"), say("colState"), say("date")]}>
				{p.consents.map((c) => (
					<tr key={`${c.purpose}-${c.grantedAt}`}>
						<td style={cell}>
							{word(say, "purpose", c.purpose)} <span style={muted}>v{c.wordingVersion}</span>
						</td>
						<td style={cell}>{c.withdrawnAt === null ? say("granted") : say("withdrawn")}</td>
						<td style={cell}>{day(c.withdrawnAt ?? c.grantedAt)}</td>
					</tr>
				))}
			</Table>
			<h3>{say("reservations")}</h3>
			{typeof p.reservations === "string" ? (
				<p style={muted}>
					{p.reservations === "unavailable" ? say("unreachable") : say("notApplicable")}
				</p>
			) : (
				<Table head={[say("colReference"), say("colStatus"), say("colWhen")]}>
					{p.reservations.map((r) => (
						<tr key={r.reference}>
							<td style={cell}>
								<code>{r.reference}</code>
							</td>
							<td style={cell}>{word(say, "status", r.status)}</td>
							<td style={cell}>
								{day(r.start)} UTC ({word(say, "mode", r.mode)})
							</td>
						</tr>
					))}
				</Table>
			)}
			<h3>{say("saved")}</h3>
			<ul>
				{p.savedArticles.map((s) => (
					<li key={s.slug}>
						{s.slug} <span style={muted}>{day(s.savedAt)}</span>
					</li>
				))}
			</ul>
			<p>
				{say("conversations")}: {p.conversations}
			</p>
			{mayErase ? (
				<div
					style={{
						display: "flex",
						gap: "calc(var(--base) * 2)",
						flexWrap: "wrap",
						alignItems: "end",
					}}
				>
					<form method="post" action="/api/platform/accounts/export">
						<input type="hidden" name="brand" value={brand} />
						<input type="hidden" name="subject" value={p.account.subject} />
						<button type="submit" style={buttonStyle}>
							{say("exportBtn")}
						</button>
					</form>
					<form
						method="post"
						action="/api/platform/accounts/erase"
						style={{ display: "grid", gap: 4 }}
					>
						<strong>{say("eraseTitle")}</strong>
						<span style={{ ...muted, maxWidth: "60ch" }}>{say("eraseHint")}</span>
						<input type="hidden" name="brand" value={brand} />
						<input type="hidden" name="subject" value={p.account.subject} />
						<input
							name="confirm"
							required
							aria-label={say("eraseWord")}
							placeholder={say("eraseWord")}
							style={inputStyle}
						/>
						<button type="submit" style={{ ...buttonStyle, color: "var(--theme-error-500)" }}>
							{say("eraseBtn")}
						</button>
					</form>
				</div>
			) : (
				<p style={muted}>{say("eraseOnPsizone")}</p>
			)}
		</section>
	);
}

export async function AccountsView(props: AdminViewServerProps): Promise<ReactElement> {
	const say = sayer(props);
	const { req } = props.initPageResult;
	if (!req.user) redirect("/admin/login?redirect=%2Fadmin%2Fplatform%2Faccounts");
	const scope = await scopeFor(req, SECTIONS.accounts.view, props.searchParams?.brand);
	const brand = scope.brand;
	const shell = (body: ReactElement) => (
		<Shell props={props} title={say("accTitle")} intro={say("accIntro")}>
			{body}
		</Shell>
	);
	if (brand === null) return shell(<p>{say("noBrand")}</p>);
	const actor = String(req.user.id);
	const control = controlFor(brand);
	const mayErase =
		(await brandsFor(req, SECTIONS.accounts.act)).includes("psizone") &&
		controlFor("psizone") !== null;
	const hits = (param(props, "hits") ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s !== "")
		.slice(0, 20);
	const people =
		control === null ? [] : await Promise.all(hits.map((h) => control.person(h, actor)));
	for (const [i, p] of people.entries()) {
		const subject = hits[i];
		if (p.ok && subject !== undefined) await log(req, { brand, actor }, "account_view", subject);
	}
	return shell(
		<>
			<BrandTabs path="/admin/platform/accounts" brands={scope.brands} brand={brand} />
			<Flash props={props} say={say} />
			{control === null ? (
				<p>{say("notConfigured")}</p>
			) : (
				<form
					method="post"
					action="/api/platform/accounts/search"
					style={{ display: "flex", gap: 8, alignItems: "end" }}
				>
					<input type="hidden" name="brand" value={brand} />
					<label style={{ display: "grid", gap: 2 }}>
						<span style={muted}>{say("accSearch")}</span>
						<input
							type="email"
							name="email"
							required
							autoComplete="off"
							style={{ ...inputStyle, minWidth: 280 }}
						/>
					</label>
					<button type="submit" style={buttonStyle}>
						{say("accFind")}
					</button>
				</form>
			)}
			{people.map((p, i) =>
				p.ok ? (
					<Person
						key={p.data.account.subject}
						p={p.data}
						say={say}
						brand={brand}
						mayErase={mayErase}
					/>
				) : (
					<p key={hits[i]}>{problemWord(say, p.problem)}</p>
				),
			)}
			{people.some((p) => p.ok) ? <p style={muted}>{say("logged")}</p> : null}
		</>,
	);
}
