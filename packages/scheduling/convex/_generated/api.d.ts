/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as appointments from "../appointments.js";
import type * as availability from "../availability.js";
import type * as calendar from "../calendar.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as expiry from "../expiry.js";
import type * as guard from "../guard.js";
import type * as retention from "../retention.js";
import type * as seed from "../seed.js";
import type * as staff from "../staff.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  appointments: typeof appointments;
  availability: typeof availability;
  calendar: typeof calendar;
  catalog: typeof catalog;
  crons: typeof crons;
  expiry: typeof expiry;
  guard: typeof guard;
  retention: typeof retention;
  seed: typeof seed;
  staff: typeof staff;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
