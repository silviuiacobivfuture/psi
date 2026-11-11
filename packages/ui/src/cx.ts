/** Joins the class names that are set. */
export function cx(...names: ReadonlyArray<string | false | null | undefined>): string {
	return names.filter((n): n is string => typeof n === "string" && n !== "").join(" ");
}
