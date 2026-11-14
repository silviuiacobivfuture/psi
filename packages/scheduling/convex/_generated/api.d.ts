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
import type * as apiAssistant from "../apiAssistant.js";
import type * as apiAudit from "../apiAudit.js";
import type * as apiBlacklist from "../apiBlacklist.js";
import type * as apiBuilder from "../apiBuilder.js";
import type * as apiCatalogExtra from "../apiCatalogExtra.js";
import type * as apiClients from "../apiClients.js";
import type * as apiDefinitionsExtra from "../apiDefinitionsExtra.js";
import type * as apiDocuments from "../apiDocuments.js";
import type * as apiFeedback from "../apiFeedback.js";
import type * as apiKeyed from "../apiKeyed.js";
import type * as apiKeys from "../apiKeys.js";
import type * as apiLeaveExtra from "../apiLeaveExtra.js";
import type * as apiMembersExtra from "../apiMembersExtra.js";
import type * as apiMoney from "../apiMoney.js";
import type * as apiMoneyExtra from "../apiMoneyExtra.js";
import type * as apiNotes from "../apiNotes.js";
import type * as apiRecords from "../apiRecords.js";
import type * as apiRecordsExtra from "../apiRecordsExtra.js";
import type * as apiReports from "../apiReports.js";
import type * as apiReportsMoney from "../apiReportsMoney.js";
import type * as apiResources from "../apiResources.js";
import type * as apiRoster from "../apiRoster.js";
import type * as apiSeries from "../apiSeries.js";
import type * as apiSettings from "../apiSettings.js";
import type * as apiSupport from "../apiSupport.js";
import type * as apiVisitEdit from "../apiVisitEdit.js";
import type * as apiVisits from "../apiVisits.js";
import type * as appointments from "../appointments.js";
import type * as availability from "../availability.js";
import type * as blacklistGate from "../blacklistGate.js";
import type * as bounded from "../bounded.js";
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
import type * as clinicValidate from "../clinicValidate.js";
import type * as clinicVisits from "../clinicVisits.js";
import type * as crons from "../crons.js";
import type * as deployment from "../deployment.js";
import type * as expiry from "../expiry.js";
import type * as feedbackLinks from "../feedbackLinks.js";
import type * as feedbackSupport from "../feedbackSupport.js";
import type * as guard from "../guard.js";
import type * as importBlacklist from "../importBlacklist.js";
import type * as importClients from "../importClients.js";
import type * as importMoney from "../importMoney.js";
import type * as importPeople from "../importPeople.js";
import type * as importRecords from "../importRecords.js";
import type * as importRoster from "../importRoster.js";
import type * as importSupport from "../importSupport.js";
import type * as importVisits from "../importVisits.js";
import type * as notifyStore from "../notifyStore.js";
import type * as reportRows from "../reportRows.js";
import type * as retention from "../retention.js";
import type * as roleIncludes from "../roleIncludes.js";
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
import type * as tables_assistantUsage from "../tables/assistantUsage.js";
import type * as tables_clinicAccess from "../tables/clinicAccess.js";
import type * as tables_clinicBlacklist from "../tables/clinicBlacklist.js";
import type * as tables_clinicDocs from "../tables/clinicDocs.js";
import type * as tables_clinicFeedback from "../tables/clinicFeedback.js";
import type * as tables_clinicNotes from "../tables/clinicNotes.js";
import type * as tables_clinicRecords from "../tables/clinicRecords.js";
import type * as tables_clinicResources from "../tables/clinicResources.js";
import type * as tables_clinicVisits from "../tables/clinicVisits.js";
import type * as tables_memberProfiles from "../tables/memberProfiles.js";
import type * as tables_notify from "../tables/notify.js";
import type * as tenants from "../tenants.js";
import type * as validators from "../validators.js";
import type * as visitConflicts from "../visitConflicts.js";
import type * as visitLinks from "../visitLinks.js";
import type * as visitMove from "../visitMove.js";
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
  apiAssistant: typeof apiAssistant;
  apiAudit: typeof apiAudit;
  apiBlacklist: typeof apiBlacklist;
  apiBuilder: typeof apiBuilder;
  apiCatalogExtra: typeof apiCatalogExtra;
  apiClients: typeof apiClients;
  apiDefinitionsExtra: typeof apiDefinitionsExtra;
  apiDocuments: typeof apiDocuments;
  apiFeedback: typeof apiFeedback;
  apiKeyed: typeof apiKeyed;
  apiKeys: typeof apiKeys;
  apiLeaveExtra: typeof apiLeaveExtra;
  apiMembersExtra: typeof apiMembersExtra;
  apiMoney: typeof apiMoney;
  apiMoneyExtra: typeof apiMoneyExtra;
  apiNotes: typeof apiNotes;
  apiRecords: typeof apiRecords;
  apiRecordsExtra: typeof apiRecordsExtra;
  apiReports: typeof apiReports;
  apiReportsMoney: typeof apiReportsMoney;
  apiResources: typeof apiResources;
  apiRoster: typeof apiRoster;
  apiSeries: typeof apiSeries;
  apiSettings: typeof apiSettings;
  apiSupport: typeof apiSupport;
  apiVisitEdit: typeof apiVisitEdit;
  apiVisits: typeof apiVisits;
  appointments: typeof appointments;
  availability: typeof availability;
  blacklistGate: typeof blacklistGate;
  bounded: typeof bounded;
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
  clinicValidate: typeof clinicValidate;
  clinicVisits: typeof clinicVisits;
  crons: typeof crons;
  deployment: typeof deployment;
  expiry: typeof expiry;
  feedbackLinks: typeof feedbackLinks;
  feedbackSupport: typeof feedbackSupport;
  guard: typeof guard;
  importBlacklist: typeof importBlacklist;
  importClients: typeof importClients;
  importMoney: typeof importMoney;
  importPeople: typeof importPeople;
  importRecords: typeof importRecords;
  importRoster: typeof importRoster;
  importSupport: typeof importSupport;
  importVisits: typeof importVisits;
  notifyStore: typeof notifyStore;
  reportRows: typeof reportRows;
  retention: typeof retention;
  roleIncludes: typeof roleIncludes;
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
  "tables/assistantUsage": typeof tables_assistantUsage;
  "tables/clinicAccess": typeof tables_clinicAccess;
  "tables/clinicBlacklist": typeof tables_clinicBlacklist;
  "tables/clinicDocs": typeof tables_clinicDocs;
  "tables/clinicFeedback": typeof tables_clinicFeedback;
  "tables/clinicNotes": typeof tables_clinicNotes;
  "tables/clinicRecords": typeof tables_clinicRecords;
  "tables/clinicResources": typeof tables_clinicResources;
  "tables/clinicVisits": typeof tables_clinicVisits;
  "tables/memberProfiles": typeof tables_memberProfiles;
  "tables/notify": typeof tables_notify;
  tenants: typeof tenants;
  validators: typeof validators;
  visitConflicts: typeof visitConflicts;
  visitLinks: typeof visitLinks;
  visitMove: typeof visitMove;
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
