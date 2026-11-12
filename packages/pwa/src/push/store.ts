import { randomUUID } from "node:crypto";
import { FAILURE_LIMIT, type PushLocale, type SubscriptionRecord, type Topic } from "./types";

export interface NewSubscription {
	endpoint: string;
	p256dh: string;
	auth: string;
	site: SubscriptionRecord["site"];
	locale: PushLocale;
	topics: ReadonlyArray<Topic>;
	subject: string | null;
}

/** A planned reminder (scheduling's `Reminder`, minus the start: nothing about the time is kept). */
export interface PlannedReminder {
	reference: string;
	/** When to send, UTC ms. */
	at: number;
	leadMinutes: number;
}

/**
 * Where subscriptions live: one store for the whole estate (Postgres in the cluster), because the
 * blog's publish hook notifies people subscribed on the other three sites.
 */
export interface PushStore {
	/** Insert or replace by endpoint (a browser re-subscribing keeps one row). */
	upsert(input: NewSubscription, at: number): Promise<SubscriptionRecord>;
	byEndpoint(endpoint: string): Promise<SubscriptionRecord | null>;
	/** Every subscription holding `topic`; for `booking`, only the given account's. */
	forTopic(topic: Topic, subject?: string): Promise<SubscriptionRecord[]>;
	forSubject(subject: string): Promise<SubscriptionRecord[]>;
	/** Every signed-in subscription holding `booking` (to match an account hash against). */
	bookingSubscriptions(): Promise<SubscriptionRecord[]>;
	removeEndpoint(endpoint: string): Promise<void>;
	/** Removes one of a person's subscriptions; false when it is not theirs (or gone). */
	removeOwned(id: string, subject: string): Promise<boolean>;
	/** Counts a failed send; at FAILURE_LIMIT the subscription is dropped. */
	failed(endpoint: string, at: number): Promise<void>;
	delivered(endpoint: string, at: number): Promise<void>;
	/** Links a booking reference to the account that made it (from the signed-in booking form). */
	linkBooking(reference: string, subject: string, at: number): Promise<void>;
	bookingSubject(reference: string): Promise<string | null>;
	/** Idempotent per (reference, leadMinutes). */
	planReminders(reminders: ReadonlyArray<PlannedReminder>): Promise<void>;
	cancelReminders(reference: string): Promise<void>;
	/** Takes the reminders due at `now` (each is handed out once). */
	takeDueReminders(now: number): Promise<PlannedReminder[]>;
	/** True the first time a key is claimed: one notification per article, ever. */
	claim(key: string, at: number): Promise<boolean>;
	close(): Promise<void>;
}

/** The whole store as plain data: the memory store holds it, the file store reads and writes it. */
export interface PushState {
	subscriptions: SubscriptionRecord[];
	bookings: Array<{ reference: string; subject: string; at: number }>;
	reminders: PlannedReminder[];
	claims: Array<{ key: string; at: number }>;
}

export function emptyState(): PushState {
	return { subscriptions: [], bookings: [], reminders: [], claims: [] };
}

type Op<T> = (state: PushState) => T;

/** The store's logic over plain state; `run` decides where the state lives and when it is saved. */
export function stateStore(run: <T>(op: Op<T>, write: boolean) => Promise<T>): PushStore {
	return {
		upsert: (input, at) =>
			run((s) => {
				const old = s.subscriptions.find((r) => r.endpoint === input.endpoint);
				const record: SubscriptionRecord = {
					id: old?.id ?? randomUUID(),
					...input,
					topics: [...new Set(input.topics)],
					createdAt: old?.createdAt ?? at,
					updatedAt: at,
					failures: 0,
				};
				s.subscriptions = [...s.subscriptions.filter((r) => r.endpoint !== input.endpoint), record];
				return record;
			}, true),
		byEndpoint: (endpoint) =>
			run((s) => s.subscriptions.find((r) => r.endpoint === endpoint) ?? null, false),
		forTopic: (topic, subject) =>
			run(
				(s) =>
					s.subscriptions.filter(
						(r) =>
							r.topics.includes(topic) &&
							(topic !== "booking" || (r.subject !== null && r.subject === subject)),
					),
				false,
			),
		forSubject: (subject) =>
			run((s) => s.subscriptions.filter((r) => r.subject === subject), false),
		bookingSubscriptions: () =>
			run(
				(s) => s.subscriptions.filter((r) => r.subject !== null && r.topics.includes("booking")),
				false,
			),
		removeEndpoint: (endpoint) =>
			run((s) => {
				s.subscriptions = s.subscriptions.filter((r) => r.endpoint !== endpoint);
			}, true),
		removeOwned: (id, subject) =>
			run((s) => {
				const before = s.subscriptions.length;
				s.subscriptions = s.subscriptions.filter((r) => !(r.id === id && r.subject === subject));
				return s.subscriptions.length < before;
			}, true),
		failed: (endpoint, at) =>
			run((s) => {
				s.subscriptions = s.subscriptions
					.map((r) =>
						r.endpoint === endpoint ? { ...r, failures: r.failures + 1, updatedAt: at } : r,
					)
					.filter((r) => r.failures < FAILURE_LIMIT);
			}, true),
		delivered: (endpoint, at) =>
			run((s) => {
				s.subscriptions = s.subscriptions.map((r) =>
					r.endpoint === endpoint && r.failures > 0 ? { ...r, failures: 0, updatedAt: at } : r,
				);
			}, true),
		linkBooking: (reference, subject, at) =>
			run((s) => {
				s.bookings = [
					...s.bookings.filter((b) => b.reference !== reference),
					{ reference, subject, at },
				];
			}, true),
		bookingSubject: (reference) =>
			run((s) => s.bookings.find((b) => b.reference === reference)?.subject ?? null, false),
		planReminders: (reminders) =>
			run((s) => {
				for (const r of reminders) {
					const same = (x: PlannedReminder) =>
						x.reference === r.reference && x.leadMinutes === r.leadMinutes;
					s.reminders = [...s.reminders.filter((x) => !same(x)), r];
				}
			}, true),
		cancelReminders: (reference) =>
			run((s) => {
				s.reminders = s.reminders.filter((r) => r.reference !== reference);
			}, true),
		takeDueReminders: (now) =>
			run((s) => {
				const due = s.reminders.filter((r) => r.at <= now);
				s.reminders = s.reminders.filter((r) => r.at > now);
				return due;
			}, true),
		claim: (key, at) =>
			run((s) => {
				if (s.claims.some((c) => c.key === key)) return false;
				s.claims = [...s.claims, { key, at }];
				return true;
			}, true),
		close: () => Promise.resolve(),
	};
}

/** In memory: tests, and a workstation with neither a database nor a writable data directory. */
export function memoryPushStore(initial: PushState = emptyState()): PushStore {
	const state = initial;
	return stateStore((op) => Promise.resolve(op(state)));
}
