#!/usr/bin/env python3
"""D1 マイグレーション検証スクリプト（依存ゼロ・Python 標準ライブラリの sqlite3 のみ）。

D1 は SQLite ベースなので、ローカルの sqlite3 で 0001 を実機適用し、STRICT/CHECK/UNIQUE/
NOT NULL/カバリングインデックス（index-only scan）/ソフトデリート除外を検証する。
wrangler 不要・ネットワーク不要で、CI でも回せる。

使い方:
    python3 scripts/validate_migrations.py
終了コード: 全 PASS で 0、失敗があれば 1。

注意: 手元の sqlite3 が古いと STRICT(3.37+) 等が未対応のことがある。SQLite 3.37 以上が必要。
"""
import sqlite3
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIG_DIR = ROOT / "migrations"

passed, failed = [], []


def ok(name):
    passed.append(name)
    print(f"  PASS {name}")


def bad(name, e):
    failed.append(name)
    print(f"  FAIL {name}  -> {e}")


def expect_ok(db, name, fn):
    try:
        fn(db)
        ok(name)
    except Exception as e:  # noqa: BLE001
        bad(name, e)


def expect_err(db, name, fn):
    try:
        fn(db)
        bad(name, "expected an error but none raised")
    except Exception:  # noqa: BLE001
        ok(name)


def main():
    if sqlite3.sqlite_version_info < (3, 37, 0):
        print(f"SQLite {sqlite3.sqlite_version} is too old (need >= 3.37 for STRICT).")
        return 1

    migrations = sorted(MIG_DIR.glob("*.sql"))
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON;")

    print("== 1. migrations apply (in order) ==")
    if not migrations:
        bad("find migrations", "no *.sql in migrations/")
        return 1
    for m in migrations:
        try:
            db.executescript(m.read_text())
            ok(f"apply {m.name}")
        except Exception as e:  # noqa: BLE001
            bad(f"apply {m.name}", e)
            print("FATAL: cannot continue")
            return 1

    print("== 2. objects created + STRICT ==")
    objs = dict(db.execute(
        "SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").fetchall())
    for n in ("songbooks", "user_settings"):
        ok(f"table {n}") if objs.get(n) == "table" else bad(f"table {n}", objs.get(n))
    (ok("index idx_songbooks_user_list") if "idx_songbooks_user_list" in objs
     else bad("index idx_songbooks_user_list", "missing"))
    ddl = db.execute("SELECT sql FROM sqlite_master WHERE name='songbooks'").fetchone()[0]
    ok("songbooks is STRICT") if "STRICT" in ddl.upper() else bad("songbooks is STRICT", "no STRICT")

    T0 = 1_700_000_000_000

    def ins(db, public_id="p1", user="user_a", name="Book", v=1, cnt=0, c=T0, u=T0, deleted=None):
        db.execute(
            "INSERT INTO songbooks(public_id,user_id,name,scales,schema_version,scale_count,"
            "created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (public_id, user, name, '{"v":1,"scales":[]}', v, cnt, c, u, deleted))

    print("== 3. valid insert ==")
    expect_ok(db, "insert valid row", lambda d: ins(d))

    print("== 4. CHECK constraints ==")
    expect_err(db, "reject name length 0", lambda d: ins(d, public_id="p_n0", name=""))
    expect_err(db, "reject name length 101", lambda d: ins(d, public_id="p_n101", name="x" * 101))
    expect_err(db, "reject scale_count < 0", lambda d: ins(d, public_id="p_neg", cnt=-1))
    expect_err(db, "reject schema_version < 1", lambda d: ins(d, public_id="p_v0", v=0))
    expect_err(db, "reject updated_at<created_at", lambda d: ins(d, public_id="p_t", c=T0, u=T0 - 1))
    expect_ok(db, "accept name length 100", lambda d: ins(d, public_id="p_n100", name="x" * 100))

    print("== 5. UNIQUE(public_id) ==")
    expect_err(db, "reject duplicate public_id", lambda d: ins(d, public_id="p1", user="user_b"))

    print("== 6. STRICT type enforcement ==")
    expect_err(db, "reject TEXT in scale_count (STRICT)",
               lambda d: d.execute(
                   "INSERT INTO songbooks(public_id,user_id,name,scales,scale_count,created_at,"
                   "updated_at) VALUES('p_str','u','N','{}','not-an-int',?,?)", (T0, T0)))

    print("== 7. NOT NULL ==")
    expect_err(db, "reject NULL public_id",
               lambda d: d.execute(
                   "INSERT INTO songbooks(public_id,user_id,name,scales,created_at,updated_at)"
                   " VALUES(NULL,'u','N','{}',?,?)", (T0, T0)))

    print("== 8. list query is index-only (USING COVERING INDEX) ==")
    db.execute("DELETE FROM songbooks")
    for i in range(5):
        ins(db, public_id=f"pk{i}", user="user_a", name=f"B{i}", cnt=i, c=T0 + i, u=T0 + i)
    ins(db, public_id="pdel", user="user_a", name="Deleted", c=T0, u=T0 + 99, deleted=T0 + 100)
    plan = db.execute(
        "EXPLAIN QUERY PLAN SELECT public_id,name,scale_count,created_at,updated_at "
        "FROM songbooks WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC",
        ("user_a",)).fetchall()
    txt = " | ".join(r[-1] for r in plan)
    print("    PLAN:", txt)
    ok("uses idx_songbooks_user_list") if "idx_songbooks_user_list" in txt else bad("uses index", txt)
    ok("no full table SCAN") if "SCAN songbooks" not in txt else bad("no full table SCAN", txt)
    (ok("TRUE covering (index-only)") if "USING COVERING INDEX" in txt
     else bad("TRUE covering (index-only)", txt))
    ok("no temp b-tree sort") if "TEMP B-TREE" not in txt else bad("no temp b-tree sort", txt)

    print("== 9. soft-deleted excluded ==")
    rows = db.execute(
        "SELECT public_id FROM songbooks WHERE user_id=? AND deleted_at IS NULL",
        ("user_a",)).fetchall()
    names = {r[0] for r in rows}
    (ok("deleted row excluded") if "pdel" not in names and len(names) == 5
     else bad("deleted row excluded", names))

    print("== 10. count (50-limit) uses index ==")
    cplan = db.execute(
        "EXPLAIN QUERY PLAN SELECT COUNT(*) FROM songbooks WHERE user_id=? AND deleted_at IS NULL",
        ("user_a",)).fetchall()
    ctxt = " | ".join(r[-1] for r in cplan)
    print("    PLAN:", ctxt)
    ok("count uses index") if "idx_songbooks_user_list" in ctxt else bad("count uses index", ctxt)

    print("== 11. user_settings ==")
    expect_ok(db, "insert user_settings",
              lambda d: d.execute("INSERT INTO user_settings(user_id,settings) VALUES('u','{}')"))
    expect_err(db, "user_settings PK dup",
               lambda d: d.execute("INSERT INTO user_settings(user_id,settings) VALUES('u','{}')"))
    expect_err(db, "user_settings NOT NULL settings",
               lambda d: d.execute("INSERT INTO user_settings(user_id,settings) VALUES('u2',NULL)"))

    print("== 12. shares (0002) ==")
    sobjs = dict(db.execute(
        "SELECT name,type FROM sqlite_master WHERE name LIKE 'shares%' OR name LIKE 'idx_shares%'").fetchall())
    ok("table shares") if sobjs.get("shares") == "table" else bad("table shares", sobjs.get("shares"))
    sddl = db.execute("SELECT sql FROM sqlite_master WHERE name='shares'").fetchone()
    ok("shares is STRICT") if sddl and "STRICT" in sddl[0].upper() else bad("shares is STRICT", "no STRICT")
    (ok("index idx_shares_expires") if "idx_shares_expires" in sobjs
     else bad("index idx_shares_expires", "missing"))
    (ok("index idx_shares_user") if "idx_shares_user" in sobjs
     else bad("index idx_shares_user", "missing"))

    def sins(d, sid="sh1", user="u", name="My Share", c=T0, e=T0 + 1):
        d.execute("INSERT INTO shares(share_id,user_id,name,scales,scale_count,created_at,expires_at)"
                  " VALUES(?,?,?,?,?,?,?)", (sid, user, name, '{"v":1,"scales":[]}', 0, c, e))

    expect_ok(db, "insert valid share", lambda d: sins(d))
    expect_err(db, "reject expires_at <= created_at", lambda d: sins(d, sid="sh_bad", c=T0, e=T0))
    expect_err(db, "reject share name length 0", lambda d: sins(d, sid="sh_n0", name=""))
    expect_err(db, "reject duplicate share_id", lambda d: sins(d, sid="sh1", user="u2"))
    expect_err(db, "reject NULL share_id",
               lambda d: d.execute("INSERT INTO shares(share_id,user_id,name,scales,created_at,expires_at)"
                                   " VALUES(NULL,'u','N','{}',?,?)", (T0, T0 + 1)))
    # "my shares" list: WHERE user_id=? AND expires_at>? uses idx_shares_user
    mplan = " | ".join(r[-1] for r in db.execute(
        "EXPLAIN QUERY PLAN SELECT share_id,name,scale_count,created_at,expires_at FROM shares "
        "WHERE user_id=? AND expires_at>? ORDER BY created_at DESC", ("u", T0)).fetchall())
    print("    MY-SHARES PLAN:", mplan)
    ok("my-shares uses idx_shares_user") if "idx_shares_user" in mplan else bad("my-shares uses idx_shares_user", mplan)
    # GET by share_id uses the unique index (seek, not scan)
    gplan = " | ".join(r[-1] for r in db.execute(
        "EXPLAIN QUERY PLAN SELECT scales FROM shares WHERE share_id=?", ("sh1",)).fetchall())
    print("    GET PLAN:", gplan)
    ok("share GET uses index seek") if "SCAN shares" not in gplan else bad("share GET uses index seek", gplan)
    # expiry cleanup uses idx_shares_expires
    eplan = " | ".join(r[-1] for r in db.execute(
        "EXPLAIN QUERY PLAN SELECT id FROM shares WHERE expires_at < ?", (T0 + 100,)).fetchall())
    print("    CLEANUP PLAN:", eplan)
    ok("expiry cleanup uses index") if "idx_shares_expires" in eplan else bad("expiry cleanup uses index", eplan)

    print(f"\n==== RESULT: {len(passed)} passed, {len(failed)} failed (SQLite {sqlite3.sqlite_version}) ====")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
