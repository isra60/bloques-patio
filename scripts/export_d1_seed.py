import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path


def quote(value):
    if value is None:
        return "null"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def insert(table, row):
    columns = list(row.keys())
    values = [quote(row[column]) for column in columns]
    return f"insert into {table} ({', '.join(columns)}) values ({', '.join(values)});"


def main():
    if len(sys.argv) != 3:
        print("Usage: export_d1_seed.py seed.json d1-seed.sql", file=sys.stderr)
        return 2

    seed = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    output = Path(sys.argv[2])
    now = datetime.now(timezone.utc).isoformat()
    lines = [
        "pragma foreign_keys = off;",
        "delete from orders;",
        "delete from variants;",
        "delete from products;",
        "pragma foreign_keys = on;",
    ]

    for product in seed["products"]:
        lines.append(insert("products", {**product, "created_at": now, "updated_at": now}))

    for variant in seed["variants"]:
        lines.append(insert("variants", {**variant, "created_at": now, "updated_at": now}))

    for order in seed["orders"]:
        lines.append(insert("orders", {
            "id": order.get("id") or order["source_key"].replace(":", "-"),
            **order,
            "created_at": now,
            "updated_at": now,
        }))

    output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(lines)} SQL statements to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

