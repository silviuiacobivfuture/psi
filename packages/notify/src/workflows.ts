import { type Workflow, workflow } from "@novu/framework";
import { z } from "zod";
import type { AppKey } from "./apps";
import { CATALOGUE, type Entry, PAYLOADS, workflowId } from "./catalogue";
import { localeOf, MetaSchema, pushWords, render } from "./render";

const Envelope = z.object({ meta: MetaSchema });

/** The one workflow of a catalogue entry for an app: in-app, push and e-mail, each switched by `meta.channels`. */
export function defineEntryWorkflow(app: AppKey, entry: Entry): Workflow {
	const payloadSchema = PAYLOADS[entry.event].and(Envelope);
	return workflow(
		workflowId(app, entry.event, entry.audience),
		async ({ step, payload, subscriber }) => {
			const locale = localeOf(subscriber.locale);
			const read = () => {
				const { meta, ...facts } = payloadSchema.parse(payload);
				return { facts, meta, rendered: render(entry, facts, locale, meta) };
			};
			const allowed = (channel: "in_app" | "push" | "email") => () =>
				!Envelope.parse(payload).meta.channels[channel];
			const wants = (channel: "in_app" | "push" | "email") => entry.channels.includes(channel);
			if (wants("in_app")) {
				await step.inApp(
					"in-app",
					async () => {
						const { rendered, facts } = read();
						return {
							subject: rendered.subject,
							body: rendered.body,
							redirect: { url: rendered.url },
							primaryAction: { label: rendered.cta, redirect: { url: rendered.url } },
							data: { app, event: entry.event, id: String(Object.values(facts)[0] ?? "") },
						};
					},
					{ skip: allowed("in_app"), disableOutputSanitization: true },
				);
			}
			if (wants("push")) {
				await step.push(
					"push",
					async () => {
						const words = pushWords(read().meta.brandName, locale);
						return { subject: words.title, body: words.body };
					},
					{ skip: allowed("push") },
				);
			}
			if (wants("email")) {
				await step.email(
					"email",
					async () => {
						const { rendered } = read();
						return { subject: rendered.subject, body: rendered.html };
					},
					{ skip: allowed("email"), disableOutputSanitization: true },
				);
			}
		},
		{
			payloadSchema,
			name: `${app}: ${entry.event} (${entry.audience})`,
			description: `${app} · ${entry.event} → ${entry.audience}`,
			tags: [app, entry.event.split(".")[0] ?? entry.event],
		},
	);
}

/** Every workflow of one app. */
export function workflowsOf(app: AppKey): Workflow[] {
	return CATALOGUE.map((entry) => defineEntryWorkflow(app, entry));
}
