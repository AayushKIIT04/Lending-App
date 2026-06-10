from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
import mysql.connector
import os
from dotenv import load_dotenv
from decimal import Decimal
import json

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__,
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))
CORS(app)

# ─── DB connection ────────────────────────────────────────────────────────────
def get_db():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "lending_db"),
    )

import datetime

def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (datetime.date, datetime.datetime)):
        return str(obj)
    if isinstance(obj, datetime.timedelta):
        return str(obj)
    if isinstance(obj, bytes):
        return obj.decode('utf-8', errors='replace')
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

def query(sql, params=(), fetchone=False, commit=False):
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    cur.execute(sql, params)
    if commit:
        conn.commit()
        last_id = cur.lastrowid
        cur.close()
        conn.close()
        return last_id
    result = cur.fetchone() if fetchone else cur.fetchall()
    cur.close()
    conn.close()
    return result

# ─── Serve frontend ───────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")

# ─── SLOTS ────────────────────────────────────────────────────────────────────
@app.route("/api/slots", methods=["GET"])
def get_slots():
    rows = query("SELECT * FROM funding_slots ORDER BY id")
    return app.response_class(
        json.dumps(rows, default=decimal_default),
        mimetype="application/json"
    )

@app.route("/api/slots/<int:slot_id>", methods=["PUT"])
def update_slot(slot_id):
    data = request.json
    query(
        "UPDATE funding_slots SET slot_name=%s, kothi_amount=%s WHERE id=%s",
        (data.get("slot_name"), data.get("kothi_amount"), slot_id),
        commit=True,
    )
    row = query("SELECT * FROM funding_slots WHERE id=%s", (slot_id,), fetchone=True)
    return app.response_class(json.dumps(row, default=decimal_default), mimetype="application/json")

@app.route("/api/slots/summary/<int:slot_id>/<month_year>", methods=["GET"])
def get_summary(slot_id, month_year):
    row = query(
        """SELECT
            COUNT(*) AS total_customers,
            SUM(funding) AS this_month_funding,
            SUM(funding * 1.28) AS total_funding_and_profit,
            SUM(payment_has_been_done) AS actual_recovery,
            SUM(funding * 0.28) AS total_profit_28,
            SUM(funding * 0.20) AS total_net_income,
            SUM(funding * 0.08) AS total_staff_commission,
            SUM(CASE WHEN is_closed = 0 THEN funding ELSE 0 END) AS running_funding,
            SUM(balance_recovery) AS total_balance_recovery
           FROM customers
           WHERE slot_id=%s AND month_year=%s""",
        (slot_id, month_year),
        fetchone=True,
    )
    if row:
        net_profit = float(row.get("total_net_income") or 0) - float(row.get("total_staff_commission") or 0)
        row["net_profit"] = net_profit
        row["month_year"] = month_year
        row["slot_id"] = slot_id
    return app.response_class(json.dumps(row, default=decimal_default), mimetype="application/json")

@app.route("/api/slots/summary", methods=["POST"])
def save_summary():
    data = request.json
    query(
        """INSERT INTO monthly_summary (slot_id, month_year, salary_and_other)
           VALUES (%s, %s, %s)
           ON DUPLICATE KEY UPDATE salary_and_other=%s""",
        (data["slot_id"], data["month_year"], data.get("salary_and_other", 0), data.get("salary_and_other", 0)),
        commit=True,
    )
    return jsonify({"message": "Saved"})

# ─── CUSTOMERS ────────────────────────────────────────────────────────────────
@app.route("/api/customers/<int:slot_id>/<month_year>", methods=["GET"])
def get_customers(slot_id, month_year):
    rows = query(
        "SELECT * FROM customers WHERE slot_id=%s AND month_year=%s ORDER BY sl_no ASC",
        (slot_id, month_year),
    )
    for r in rows:
        if r.get("opening_date"):
            r["opening_date"] = str(r["opening_date"])
    return app.response_class(json.dumps(rows, default=decimal_default), mimetype="application/json")

@app.route("/api/customers", methods=["POST"])
def add_customer():
    d = request.json
    slot_id = d.get("slot_id")
    customer_name = d.get("customer_name")
    funding = d.get("funding")
    opening_date = d.get("opening_date")
    month_year = d.get("month_year")
    payment_has_been_done = d.get("payment_has_been_done", 0) or 0
    daily_recovery = d.get("daily_recovery", 0) or 0
    sl_no = d.get("sl_no")

    if not all([slot_id, customer_name, funding, opening_date, month_year]):
        return jsonify({"error": "Missing required fields"}), 400

    if not sl_no:
        row = query(
            "SELECT COALESCE(MAX(sl_no), 0) + 1 AS next_sl FROM customers WHERE slot_id=%s AND month_year=%s",
            (slot_id, month_year),
            fetchone=True,
        )
        sl_no = row["next_sl"]

    last_id = query(
        """INSERT INTO customers (slot_id, sl_no, opening_date, customer_name, funding,
           payment_has_been_done, month_year, daily_recovery)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
        (slot_id, sl_no, opening_date, customer_name, funding,
         payment_has_been_done, month_year, daily_recovery),
        commit=True,
    )
    new_row = query("SELECT * FROM customers WHERE id=%s", (last_id,), fetchone=True)
    if new_row and new_row.get("opening_date"):
        new_row["opening_date"] = str(new_row["opening_date"])
    return app.response_class(
        json.dumps(new_row, default=decimal_default),
        status=201,
        mimetype="application/json"
    )

@app.route("/api/customers/<int:cid>", methods=["PUT"])
def update_customer(cid):
    d = request.json
    fields = []
    values = []
    allowed = ["payment_has_been_done", "daily_recovery", "is_closed",
               "customer_name", "funding", "opening_date"]
    for key in allowed:
        if key in d:
            fields.append(f"{key}=%s")
            values.append(d[key])
    if not fields:
        return jsonify({"error": "No fields to update"}), 400
    values.append(cid)
    query(f"UPDATE customers SET {', '.join(fields)} WHERE id=%s", values, commit=True)
    updated = query("SELECT * FROM customers WHERE id=%s", (cid,), fetchone=True)
    if updated and updated.get("opening_date"):
        updated["opening_date"] = str(updated["opening_date"])
    return app.response_class(json.dumps(updated, default=decimal_default), mimetype="application/json")

@app.route("/api/customers/<int:cid>", methods=["DELETE"])
def delete_customer(cid):
    query("DELETE FROM customers WHERE id=%s", (cid,), commit=True)
    return jsonify({"message": "Deleted successfully"})


# ─── DAILY COLLECTIONS ───────────────────────────────────────────────────────
@app.route("/api/daily-collections/<int:slot_id>/<month_year>", methods=["GET"])
def get_daily_collections(slot_id, month_year):
    rows = query(
        """SELECT *, DAY(collection_date) AS day_number, actual_collected AS amount_collected
           FROM daily_collections
           WHERE slot_id=%s AND month_year=%s
           ORDER BY collection_date ASC""",
        (slot_id, month_year),
    )
    return app.response_class(json.dumps(rows, default=decimal_default), mimetype="application/json")

@app.route("/api/daily-collections", methods=["POST"])
def upsert_daily_collection():
    d = request.json
    slot_id    = d.get("slot_id")
    month_year = d.get("month_year")
    day_number = d.get("day_number")
    amount     = d.get("amount", 0) or 0
    note       = d.get("note", "") or ""
    y, m = month_year.split("-")
    collection_date = f"{y}-{m}-{str(day_number).zfill(2)}"
    query(
        """INSERT INTO daily_collections (slot_id, month_year, collection_date, actual_collected, note)
           VALUES (%s, %s, %s, %s, %s)
           ON DUPLICATE KEY UPDATE actual_collected=%s, note=%s""",
        (slot_id, month_year, collection_date, amount, note, amount, note),
        commit=True,
    )
    row = query(
        """SELECT *, DAY(collection_date) AS day_number, actual_collected AS amount_collected
           FROM daily_collections
           WHERE slot_id=%s AND collection_date=%s""",
        (slot_id, collection_date), fetchone=True
    )
    return app.response_class(json.dumps(row, default=decimal_default), mimetype="application/json")


# ─── CARRY FORWARD (End of Month) ────────────────────────────────────────────
@app.route("/api/carry-forward", methods=["POST"])
def carry_forward():
    """
    Copies all ACTIVE (is_closed=0) customers from source month to target month.
    Resets payment_has_been_done=0 and daily_recovery=0 for the new month.
    Skips any customer already existing in target month (safe to re-run).
    """
    data       = request.json
    slot_id    = data.get("slot_id")
    from_month = data.get("from_month")
    to_month   = data.get("to_month")

    if not all([slot_id, from_month, to_month]):
        return jsonify({"error": "Missing slot_id, from_month or to_month"}), 400

    active = query(
        "SELECT * FROM customers WHERE slot_id=%s AND month_year=%s AND is_closed=0",
        (slot_id, from_month),
    )

    if not active:
        return jsonify({"copied": 0, "message": "No active customers to carry forward."})

    copied = 0
    skipped = 0
    for c in active:
        exists = query(
            "SELECT id FROM customers WHERE slot_id=%s AND month_year=%s AND customer_name=%s",
            (slot_id, to_month, c["customer_name"]),
            fetchone=True,
        )
        if exists:
            skipped += 1
            continue

        row = query(
            "SELECT COALESCE(MAX(sl_no), 0) + 1 AS next_sl FROM customers WHERE slot_id=%s AND month_year=%s",
            (slot_id, to_month),
            fetchone=True,
        )
        next_sl = row["next_sl"]

        query(
            """INSERT INTO customers
               (slot_id, sl_no, opening_date, customer_name, funding,
                payment_has_been_done, month_year, daily_recovery, is_closed)
               VALUES (%s, %s, %s, %s, %s, 0, %s, 0, 0)""",
            (slot_id, next_sl, c["opening_date"], c["customer_name"], c["funding"], to_month),
            commit=True,
        )
        copied += 1

    return jsonify({
        "copied": copied,
        "skipped": skipped,
        "message": f"{copied} customer(s) carried to {to_month}. {skipped} already existed and were skipped."
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)