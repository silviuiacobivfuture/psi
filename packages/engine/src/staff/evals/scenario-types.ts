import type { ToolKey } from "../copy";
import type { StaffPage } from "../events";
import type { FakeStaffPort } from "../testing";

/** A tool that must be called, or any of several that serve equally well. */
export type Wanted = ToolKey | ReadonlyArray<ToolKey>;

/** One call the right trajectory makes. */
export interface Move {
	tool: ToolKey;
	input: Record<string, unknown>;
}

/** What must be true once the turn is over (and, when asked, after the person confirmed). */
export interface Expect {
	/** Proposal cards shown: exactly this many. */
	proposals: number;
	/** Card kinds that must appear. */
	cards?: ReadonlyArray<string>;
	/** Tools whose chip must end `refused`. */
	refused?: ReadonlyArray<ToolKey>;
	/** The state of the clinic after every proposal was confirmed, in order. */
	after?: (port: FakeStaffPort) => boolean;
	/** Words the answer should contain (judged on live runs only: a script's text is fixed). */
	say?: ReadonlyArray<RegExp>;
}

/**
 * A realistic request to the assistant, on synthetic data (the fake port's clinic: Friday
 * 2026-11-13, Ana Pop signed in as reception). `script` is the trajectory a good assistant takes;
 * the replay runs it through the real tools, guards and port to prove it ends as `expect` says,
 * and the live run lets a real model find its own way and judges the same `mustCall` and
 * `expect`.
 */
export interface Scenario {
	id: string;
	by: "reception" | "therapist" | "owner";
	lang: "ro" | "en";
	user: string;
	page?: StaffPage;
	setup?: (port: FakeStaffPort) => void;
	script: ReadonlyArray<Move>;
	/** Tools that must be called, in this order (others may sit between). */
	mustCall: ReadonlyArray<Wanted>;
	mustNotCall?: ReadonlyArray<ToolKey>;
	expect: Expect;
}
