import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import type { ReactElement } from "react";
import { scopeFor } from "../../platform/access";
import { SECTIONS } from "../../platform/sections";
import { controlFor } from "../../platform/services";
import { cell, Shell, sayer } from "../shell";
import {
	Badge,
	BrandTabs,
	box,
	buttonStyle,
	Flash,
	muted,
	problemWord,
	stateWord,
	Table,
	word,
} from "./parts";

/**
 * /admin/platform/notifications — the brand's push subscribers by purpose, the failing ones, the
 * articles announced, and "send a test to me" (the staff member's own devices only). Needs
 * `notifications_admin`. Article announcements stay automatic on publish.
 */
export async function NotificationsView(props: AdminViewServerProps): Promise<ReactElement> {
	const say = sayer(props);
	const { req } = props.initPageResult;
	if (!req.user) redirect("/admin/login?redirect=%2Fadmin%2Fplatform%2Fnotifications");
	const scope = await scopeFor(req, SECTIONS.notifications.view, props.searchParams?.brand);
	const brand = scope.brand;
	const shell = (body: ReactElement) => (
		<Shell props={props} title={say("notifTitle")} intro={say("notifIntro")}>
			{body}
		</Shell>
	);
	if (brand === null) return shell(<p>{say("noBrand")}</p>);
	const control = controlFor(brand);
	const stats = control === null ? null : await control.push(String(req.user.id));
	return shell(
		<>
			<BrandTabs path="/admin/platform/notifications" brands={scope.brands} brand={brand} />
			<Flash props={props} say={say} />
			<section style={box}>
				{stats === null ? (
					<p>{say("notConfigured")}</p>
				) : !stats.ok ? (
					<p>{problemWord(say, stats.problem)}</p>
				) : (
					<>
						<p>
							<Badge state={stats.data.state} label={stateWord(say, stats.data.state)} />{" "}
							{stats.data.reason === undefined ? null : (
								<span style={muted}>{stats.data.reason}</span>
							)}
						</p>
						<Table head={[say("topic"), say("subscribers")]}>
							{stats.data.byTopic.map((t) => (
								<tr key={t.topic}>
									<td style={cell}>{word(say, "topic", t.topic)}</td>
									<td style={{ ...cell, fontVariantNumeric: "tabular-nums" }}>{t.subscribers}</td>
								</tr>
							))}
						</Table>
						<p>
							{say("total")}: {stats.data.total} · {say("signedIn")}: {stats.data.signedIn} ·{" "}
							{say("failing")}: {stats.data.failing}
						</p>
						<p>
							{say("announced")}: {stats.data.announced}
						</p>
					</>
				)}
			</section>
			{control === null ? null : (
				<section style={box}>
					<p style={muted}>{say("testPushHint")}</p>
					<form method="post" action="/api/platform/notifications/test">
						<input type="hidden" name="brand" value={brand} />
						<button type="submit" style={buttonStyle}>
							{say("testPush")}
						</button>
					</form>
				</section>
			)}
		</>,
	);
}
