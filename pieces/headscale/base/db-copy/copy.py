"""A consistent copy of Headscale's database, through SQLite's own online-backup API.

Runs in the headscale-db-copy CronJob, against a read-only mount of the live volume. The
same shape as gitops/platform/system-upgrade-controller/datastore-copy/copy.py, which says
why: mode=ro, one read transaction, verified before anything is uploaded. Exit 0 leaves a
verified /work/db.sqlite.gz; anything else leaves nothing to upload and prints one line
`COPY REFUSED [REASON]: ...`. Only counts are ever printed: the file holds every node's keys.

.github/scripts/tests/headscale_test.sh (H11) runs this against a live Headscale and boots a
new server from what it produced.
"""

import datetime
import gzip
import os
import shutil
import sqlite3
import sys

SOURCE = os.environ.get("HEADSCALE_DB", "/db/db.sqlite")
WORK = os.environ.get("COPY_WORK", "/work")
BUSY_TIMEOUT_SECS = 60
REQUIRED_TABLES = {"nodes", "users", "pre_auth_keys"}


def refuse(reason: str, message: str) -> None:
    for name in ("db.sqlite", "db.sqlite-wal", "db.sqlite-shm", "db.sqlite.gz", "taken-at"):
        path = os.path.join(WORK, name)
        if os.path.exists(path):
            os.remove(path)
    print(f"COPY REFUSED [{reason}]: {message}", file=sys.stderr)
    sys.exit(3)


def take_copy(copy_path: str) -> None:
    try:
        os.stat(SOURCE)
    except FileNotFoundError:
        refuse("SOURCE_MISSING", f"{SOURCE} does not exist")
    except PermissionError:
        refuse("SOURCE_UNREADABLE", f"{SOURCE} cannot be read by uid {os.getuid()}")
    try:
        source = sqlite3.connect(f"file:{SOURCE}?mode=ro", uri=True, timeout=BUSY_TIMEOUT_SECS)
        copy = sqlite3.connect(copy_path)
        with copy:
            source.backup(copy)
        # One plain file that opens anywhere; Headscale switches it back to WAL at start.
        copy.execute("PRAGMA journal_mode=DELETE")
        copy.close()
        source.close()
    except sqlite3.Error as err:
        refuse("BACKUP_FAILED", f"the online backup stopped: {err}")


def verify(copy_path: str) -> dict:
    """A status proves nothing: an empty file passes integrity_check."""
    try:
        copy = sqlite3.connect(f"file:{copy_path}?mode=ro", uri=True)
        integrity = copy.execute("PRAGMA integrity_check").fetchall()
        if integrity != [("ok",)]:
            refuse("INTEGRITY_FAILED", f"integrity_check reported {len(integrity)} problem(s)")
        tables = {row[0] for row in copy.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        missing = REQUIRED_TABLES - tables
        if missing:
            refuse("NOT_HEADSCALE", f"the copy lacks the tables {sorted(missing)}")
        nodes = copy.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
        users = copy.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        copy.close()
    except sqlite3.Error as err:
        refuse("INTEGRITY_FAILED", f"the copy does not open as a database: {err}")
    return {"nodes": nodes, "users": users}


def compress(copy_path: str, out_path: str) -> None:
    with open(copy_path, "rb") as raw, gzip.open(out_path, "wb", compresslevel=6) as packed:
        shutil.copyfileobj(raw, packed, 1024 * 1024)
    os.remove(copy_path)


def main() -> None:
    os.umask(0o027)
    copy_path = os.path.join(WORK, "db.sqlite")
    out_path = os.path.join(WORK, "db.sqlite.gz")
    # Read BEFORE the backup, so the name says what the contents are at least as new as.
    taken_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    take_copy(copy_path)
    counts = verify(copy_path)
    compress(copy_path, out_path)
    with open(os.path.join(WORK, "taken-at"), "w", encoding="ascii") as stamp:
        stamp.write(taken_at + "\n")
    print(f"copy ok: integrity_check=ok nodes={counts['nodes']} users={counts['users']} gz_bytes={os.path.getsize(out_path)}")


if __name__ == "__main__":
    main()
