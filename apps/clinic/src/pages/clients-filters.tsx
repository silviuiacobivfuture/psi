import type { JSX } from "hono/jsx/jsx-runtime";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { ClientListAsk } from "../port/port";
import type { Column } from "../port/schema";
import { clientsHref } from "./clients-query";

/**
 * The client list's search, filters and order: ONE GET form (it works without JavaScript and its address is the list's).
 * With Datastar, typing (debounced) and each choice fetch the list in place; the standing is two links.
 */

const LIVE = "@get('/clients', {contentType: 'form'})";

function Choice({
	name,
	label,
	value,
	options,
}: {
	name: string;
	label: string;
	value: string;
	options: ReadonlyArray<readonly [string, string]>;
}): JSX.Element {
	return (
		<label class="adm-field cl-filter">
			<span>{label}</span>
			<select class="adm-input" name={name} data-filter={name}>
				{options.map(([v, text]) => (
					<option key={v} value={v} selected={v === value}>
						{text}
					</option>
				))}
			</select>
		</label>
	);
}

export function ClientFilters({
	ctx,
	ask,
	practitioners,
}: {
	ctx: Ctx;
	ask: ClientListAsk;
	practitioners: ReadonlyArray<Column>;
}): JSX.Element {
	const o = at(ctx.locale);
	const standing = (filter: ClientListAsk["filter"]) =>
		clientsHref({ ...ask, filter }, 1, ask.size);
	return (
		<div class="cl-filters" id="client-filters" data-filters>
			<nav class="adm-seg" aria-label={m.filter_label({}, o)}>
				{(
					[
						["current", m.filter_current({}, o)],
						["archived", m.filter_archived({}, o)],
					] as const
				).map(([key, label]) => (
					<a
						key={key}
						class="adm-seg__item"
						href={standing(key)}
						aria-current={key === ask.filter ? "true" : undefined}
						data-on:click__prevent={`@get('${standing(key)}')`}
					>
						{label}
					</a>
				))}
			</nav>
			<form
				method="get"
				action="/clients"
				class="cl-filters__form"
				aria-label={m.cl_f_label({}, o)}
				data-on:change={LIVE}
				data-on:submit__prevent={LIVE}
			>
				<input type="hidden" name="via" value="filters" />
				<input type="hidden" name="filter" value={ask.filter} />
				<input type="hidden" name="size" value={String(ask.size)} />
				<label class="adm-field cl-filter cl-filter--q">
					<span>{m.clients_search_label({}, o)}</span>
					<input
						id="clients-q"
						class="adm-input"
						type="search"
						name="q"
						value={ask.q}
						maxlength={120}
						autocomplete="off"
						{...{ "data-on:input__debounce.300ms": LIVE }}
					/>
				</label>
				<Choice
					name="sort"
					label={m.cl_f_sort({}, o)}
					value={ask.sort}
					options={[
						["name", m.cl_sort_name({}, o)],
						["-name", m.cl_sort_name_desc({}, o)],
						["-last", m.cl_sort_last_desc({}, o)],
						["last", m.cl_sort_last({}, o)],
						["-created", m.cl_sort_created_desc({}, o)],
						["created", m.cl_sort_created({}, o)],
					]}
				/>
				{practitioners.length === 0 ? null : (
					<Choice
						name="practitioner"
						label={m.cl_f_practitioner({}, o)}
						value={ask.practitioner ?? ""}
						options={[
							["", m.cl_f_practitioner_any({}, o)],
							...practitioners.map((p) => [p.id, p.name] as const),
						]}
					/>
				)}
				<Choice
					name="flag"
					label={m.cl_f_flag({}, o)}
					value={ask.flag ?? ""}
					options={[
						["", m.cl_f_any({}, o)],
						...(ctx.can.has("blacklist_view")
							? [["listed", m.cl_f_flag_listed({}, o)] as const]
							: []),
						["unassigned", m.cl_f_flag_unassigned({}, o)],
					]}
				/>
				<Choice
					name="package"
					label={m.cl_f_package({}, o)}
					value={ask.pkg ?? ""}
					options={[
						["", m.cl_f_any({}, o)],
						["with", m.cl_f_pkg_with({}, o)],
						["without", m.cl_f_pkg_without({}, o)],
					]}
				/>
				<div class="cl-filters__go">
					<button class="adm-btn" type="submit">
						{m.cl_f_apply({}, o)}
					</button>
					<a
						class="adm-btn adm-btn--ghost"
						href={clientsHref(
							{
								filter: ask.filter,
								q: "",
								sort: "name",
								practitioner: null,
								flag: null,
								pkg: null,
							},
							1,
							ask.size,
						)}
						data-filters-clear
					>
						{m.cl_f_clear({}, o)}
					</a>
				</div>
			</form>
		</div>
	);
}
