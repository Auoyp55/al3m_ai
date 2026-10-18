import sys, json, sqlite3, os

try:
    req = json.load(sys.stdin)
    db_path = req["dbPath"]
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    action = req["action"]
    sql = req.get("sql", "")
    params = req.get("params", [])

    if action == "exec":
        conn.executescript(sql)
        conn.commit()
        result = {"ok": True}

    elif action == "pragma":
        cur = conn.execute("PRAGMA " + sql)
        rows = [dict(r) for r in cur.fetchall()]
        result = {"rows": rows}

    elif action == "run":
        cur = conn.execute(sql, params)
        conn.commit()
        result = {
            "changes": cur.rowcount,
            "lastInsertRowid": cur.lastrowid
        }

    elif action == "get":
        row = conn.execute(sql, params).fetchone()
        result = dict(row) if row else None

    elif action == "transaction":
        try:
            conn.execute("BEGIN IMMEDIATE")
            for statement in req.get("statements", []):
                conn.execute(statement["sql"], statement.get("params", []))
            conn.commit()
            result = {"ok": True}
        except Exception:
            conn.rollback()
            raise

    elif action == "all":
        rows = conn.execute(sql, params).fetchall()
        result = [dict(r) for r in rows]

    else:
        raise ValueError("Unknown action")

    print(json.dumps(result))
    conn.close()

except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
