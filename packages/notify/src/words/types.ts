/** Every value a template may print; each message takes the subset it names. */
export interface Params {
	readonly name: string;
	readonly kind: string;
	readonly service: string;
	readonly date: string;
	readonly time: string;
	readonly client: string;
	readonly remaining: string;
	readonly person: string;
	readonly from: string;
	readonly to: string;
	readonly amount: string;
	readonly summary: string;
	/** `" for Ana"` or empty: the child an invitation to a guardian is about. */
	readonly behalf: string;
	/** The last day an invitation link works, written for the reader. */
	readonly expires: string;
	/** `" Done by Ana."` or empty: who made the change a team member is told about. */
	readonly byline: string;
	readonly count: string;
	readonly attended: string;
	readonly cancelled: string;
	readonly noShows: string;
	readonly percent: string;
	/** `" Revenue: 250 RON."` or empty (only for those whose role reads revenue). */
	readonly revenueLine: string;
	readonly revenue: string;
	/** A word from one of the enums: the severity, the channel, what overlaps, what changed, the action, why. */
	readonly severity: string;
	readonly channel: string;
	readonly what: string;
	readonly action: string;
	readonly reason: string;
	readonly by: string;
	/** `" (the target)"` or empty. */
	readonly target: string;
	readonly rating: string;
}

export type Locale = "ro" | "en";
export type Fn = (params: Params, options: { locale: Locale }) => string;

export interface Words {
	readonly subject: Fn;
	readonly body: Fn;
	readonly cta: Fn;
}
