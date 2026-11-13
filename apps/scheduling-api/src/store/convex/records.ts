import type { PartialCollections } from "./collections";
import { definitionCollection } from "./definitionStore";
import { fileCollection } from "./fileStore";
import { importCollection } from "./importStore";
import { leaveCollection } from "./leave";
import { noteCollection } from "./notes";
import { recordCollection } from "./recordStore";
import { rosterCollection } from "./roster";
import type { Rpc } from "./rpc";

/** The roster, leave, clinical records, files, builder definitions and import runs. */
export function recordCollections(rpc: Rpc): PartialCollections {
	return {
		roster: rosterCollection(rpc),
		leave: leaveCollection(rpc),
		records: recordCollection(rpc),
		files: fileCollection(rpc),
		notes: noteCollection(rpc),
		definitions: definitionCollection(rpc),
		imports: importCollection(rpc),
	};
}
