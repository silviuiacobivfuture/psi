"""A consistent copy of the live k3s datastore, through SQLite's own online-backup API.

Runs in the k3s-datastore-copy CronJob (../k3s-datastore-copy.yaml says why it is a
CronJob here). Exit 0 leaves a verified /work/state.db.gz; anything else leaves nothing
to upload, so a bad copy can never replace a good one, and prints one line
`COPY REFUSED [REASON]: ...`. Only counts are ever printed: the file holds every
Secret on the cluster.

The source is opened mode=ro on a read-only mount. SQLite takes its shared read lock
on the -shm file with a read-only descriptor, so the checkpointer honours this reader
while it holds its snapshot; backup() with its default pages=-1 copies every page in
that one read transaction, so a write during the copy cannot make it restart or mix
two states. tests/datastore-copy.test.sh runs this against a live writer.
"""

import datetime
import gzip
import os
import shutil
import sqlite3
import sys

SOURCE = os.environ.get("DATASTORE_DB", "/db/state.db")
WORK = os.environ.get("DATASTORE_WORK", "/work")
BUSY_TIMEOUT_SECS = 60
GZIP_LEVEL = 6


def refuse(reason: str, message: str) -> None:
    for name in ("state.db", "state.db-wal", "state.db-shm", "state.db.gz", "taken-at"):
        path = os.path.join(WORK, name)
        if os.path.exists(path):
            os.remove(path)
    print(f"COPY REFUSED [{reason}]: {message}", file=sys.stderr)
    sys.exit(3)


def take_copy(copy_path: str) -> None:
    try:
        os.stat(SOURCE)
    except FileNotFoundError:
        refuse("SOURCE_MISSING", f"{SOURCE} does not exist; this node is not on SQLite")
    except PermissionError:
        refuse("SOURCE_UNREADABLE", f"{SOURCE} cannot be read by uid {os.getuid()}; k3s keeps its directory 0700 root")
    try:
        source = sqlite3.connect(f"file:{SOURCE}?mode=ro", uri=True, timeout=BUSY_TIMEOUT_SECS)
        copy = sqlite3.connect(copy_path)
        with copy:
            source.backup(copy)
        # The header carries the source's WAL flag. A rollback journal makes the copy one
        # plain file that opens read-only anywhere; k3s switches it back to WAL itself.
        copy.execute("PRAGMA journal_mode=DELETE")
        copy.close()
        source.close()
    except sqlite3.Error as err:
        refuse("BACKUP_FAILED", f"the online backup stopped: {err}")


def verify(copy_path: str) -> dict:
    """A status proves nothing: an empty database passes integrity_check."""
    try:
        copy = sqlite3.connect(f"file:{copy_path}?mode=ro", uri=True)
        integrity = copy.execute("PRAGMA integrity_check").fetchall()
        if integrity != [("ok",)]:
            refuse("INTEGRITY_FAILED", f"integrity_check reported {len(integrity)} problem(s)")
        tables = {row[0] for row in copy.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "kine" not in tables:
            refuse("NOT_A_DATASTORE", "the copy has no kine table")
        live = "FROM kine WHERE deleted = 0 AND id IN (SELECT MAX(id) FROM kine GROUP BY name)"
        objects = copy.execute(f"SELECT COUNT(*) {live}").fetchone()[0]
        namespaces = copy.execute(f"SELECT COUNT(*) {live} AND name LIKE '/registry/namespaces/%'").fetchone()[0]
        bootstrap = copy.execute(f"SELECT COUNT(*) {live} AND name LIKE '/bootstrap/%'").fetchone()[0]
        copy.close()
    except sqlite3.Error as err:
        refuse("INTEGRITY_FAILED", f"the copy does not open as a database: {err}")
    if namespaces == 0:
        refuse("EMPTY_DATASTORE", f"the copy holds {objects} objects and no namespace")
    if bootstrap == 0:
        refuse("NO_BOOTSTRAP", "the copy holds no /bootstrap/ row: the cluster's certificates could not be restored from it")
    return {"objects": objects, "namespaces": namespaces, "bootstrap": bootstrap}


def compress(copy_path: str, out_path: str) -> None:
    with open(copy_path, "rb") as raw, gzip.open(out_path, "wb", compresslevel=GZIP_LEVEL) as packed:
        shutil.copyfileobj(raw, packed, 1024 * 1024)
    os.remove(copy_path)


def memory_peak() -> str:
    try:
        with open("/sys/fs/cgroup/memory.peak", encoding="ascii") as peak:
            return f"{int(peak.read()) // (1024 * 1024)}Mi"
    except OSError:
        return "unknown"


def main() -> None:
    os.umask(0o027)  # owner and the pod's fsGroup: the upload container, nobody else
    copy_path = os.path.join(WORK, "state.db")
    out_path = os.path.join(WORK, "state.db.gz")
    # The copy's name says when its contents are from, so the clock is read BEFORE the
    # backup: whatever existed at that time is in the copy, which is what the drill
    # compares. Named at upload, a runner's Secret created in between read as lost.
    taken_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    take_copy(copy_path)
    counts = verify(copy_path)
    raw_bytes = os.path.getsize(copy_path)
    compress(copy_path, out_path)
    with open(os.path.join(WORK, "taken-at"), "w", encoding="ascii") as stamp:
        stamp.write(taken_at + "\n")
    print(
        f"copy ok: integrity_check=ok objects={counts['objects']} namespaces={counts['namespaces']} "
        f"bootstrap={counts['bootstrap']} raw_bytes={raw_bytes} gz_bytes={os.path.getsize(out_path)} "
        f"memory_peak={memory_peak()}"
    )


if __name__ == "__main__":
    main()
