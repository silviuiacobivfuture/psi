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
import type * as apiAccess from "../apiAccess.js";
import type * as apiAppsExtra from "../apiAppsExtra.js";
import type * as apiAudit from "../apiAudit.js";
import type * as apiBuilder from "../apiBuilder.js";
import type * as apiCatalogExtra from "../apiCatalogExtra.js";
import type * as apiClients from "../apiClients.js";
import type * as apiDefinitionsExtra from "../apiDefinitionsExtra.js";
import type * as apiLeaveExtra from "../apiLeaveExtra.js";
import type * as apiMembersExtra from "../apiMembersExtra.js";
import type * as apiMoney from "../apiMoney.js";
import type * as apiMoneyExtra from "../apiMoneyExtra.js";
import type * as apiRecords from "../apiRecords.js";
import type * as apiRecordsExtra from "../apiRecordsExtra.js";
import type * as apiResources from "../apiResources.js";
import type * as apiRoster from "../apiRoster.js";
import type * as apiSettings from "../apiSettings.js";
import type * as apiSupport from "../apiSupport.js";
import type * as apiVisits from "../apiVisits.js";
import type * as appointments from "../appointments.js";
import type * as availability from "../availability.js";
import type * as calendar from "../calendar.js";
import type * as callbackSchema from "../callbackSchema.js";
import type * as callbacks from "../callbacks.js";
import type * as catalog from "../catalog.js";
import type * as changeLog from "../changeLog.js";
import type * as changes from "../changes.js";
import type * as clinicApps from "../clinicApps.js";
import type * as clinicErase from "../clinicErase.js";
import type * as clinicInspect from "../clinicInspect.js";
import type * as clinicKeys from "../clinicKeys.js";
import type * as clinicRetention from "../clinicRetention.js";
import type * as clinicStanding from "../clinicStanding.js";
import type * as clinicTables from "../clinicTables.js";
import type * as clinicVisits from "../clinicVisits.js";
import type * as crons from "../crons.js";
import type * as expiry from "../expiry.js";
import type * as guard from "../guard.js";
import type * as importClients from "../importClients.js";
import type * as importMoney from "../importMoney.js";
import type * as importPeople from "../importPeople.js";
import type * as importRecords from "../importRecords.js";
import type * as importRoster from "../importRoster.js";
import type * as importSupport from "../importSupport.js";
import type * as importVisits from "../importVisits.js";
import type * as retention from "../retention.js";
import type * as roomPlan from "../roomPlan.js";
import type * as seed from "../seed.js";
import type * as setupSupport from "../setupSupport.js";
import type * as staff from "../staff.js";
import type * as staffBoard from "../staffBoard.js";
import type * as staffCatalog from "../staffCatalog.js";
import type * as staffClients from "../staffClients.js";
import type * as staffRequests from "../staffRequests.js";
import type * as staffRooms from "../staffRooms.js";
import type * as staffSchedule from "../staffSchedule.js";
import type * as staffSetup from "../staffSetup.js";
import type * as tables_apiRecordsExtra from "../tables/apiRecordsExtra.js";
import type * as tables_clinicAccess from "../tables/clinicAccess.js";
import type * as tables_clinicRecords from "../tables/clinicRecords.js";
import type * as tables_clinicResources from "../tables/clinicResources.js";
import type * as tables_clinicVisits from "../tables/clinicVisits.js";
import type * as tables_memberProfiles from "../tables/memberProfiles.js";
import type * as tenants from "../tenants.js";
import type * as validators from "../validators.js";
import type * as visitConflicts from "../visitConflicts.js";
import type * as webRequests from "../webRequests.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  apiAccess: typeof apiAccess;
  apiAppsExtra: typeof apiAppsExtra;
  apiAudit: typeof apiAudit;
  apiBuilder: typeof apiBuilder;
  apiCatalogExtra: typeof apiCatalogExtra;
  apiClients: typeof apiClients;
  apiDefinitionsExtra: typeof apiDefinitionsExtra;
  apiLeaveExtra: typeof apiLeaveExtra;
  apiMembersExtra: typeof apiMembersExtra;
  apiMoney: typeof apiMoney;
  apiMoneyExtra: typeof apiMoneyExtra;
  apiRecords: typeof apiRecords;
  apiRecordsExtra: typeof apiRecordsExtra;
  apiResources: typeof apiResources;
  apiRoster: typeof apiRoster;
  apiSettings: typeof apiSettings;
  apiSupport: typeof apiSupport;
  apiVisits: typeof apiVisits;
  appointments: typeof appointments;
  availability: typeof availability;
  calendar: typeof calendar;
  callbackSchema: typeof callbackSchema;
  callbacks: typeof callbacks;
  catalog: typeof catalog;
  changeLog: typeof changeLog;
  changes: typeof changes;
  clinicApps: typeof clinicApps;
  clinicErase: typeof clinicErase;
  clinicInspect: typeof clinicInspect;
  clinicKeys: typeof clinicKeys;
  clinicRetention: typeof clinicRetention;
  clinicStanding: typeof clinicStanding;
  clinicTables: typeof clinicTables;
  clinicVisits: typeof clinicVisits;
  crons: typeof crons;
  expiry: typeof expiry;
  guard: typeof guard;
  importClients: typeof importClients;
  importMoney: typeof importMoney;
  importPeople: typeof importPeople;
  importRecords: typeof importRecords;
  importRoster: typeof importRoster;
  importSupport: typeof importSupport;
  importVisits: typeof importVisits;
  retention: typeof retention;
  roomPlan: typeof roomPlan;
  seed: typeof seed;
  setupSupport: typeof setupSupport;
  staff: typeof staff;
  staffBoard: typeof staffBoard;
  staffCatalog: typeof staffCatalog;
  staffClients: typeof staffClients;
  staffRequests: typeof staffRequests;
  staffRooms: typeof staffRooms;
  staffSchedule: typeof staffSchedule;
  staffSetup: typeof staffSetup;
  "tables/apiRecordsExtra": typeof tables_apiRecordsExtra;
  "tables/clinicAccess": typeof tables_clinicAccess;
  "tables/clinicRecords": typeof tables_clinicRecords;
  "tables/clinicResources": typeof tables_clinicResources;
  "tables/clinicVisits": typeof tables_clinicVisits;
  "tables/memberProfiles": typeof tables_memberProfiles;
  tenants: typeof tenants;
  validators: typeof validators;
  visitConflicts: typeof visitConflicts;
  webRequests: typeof webRequests;
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
