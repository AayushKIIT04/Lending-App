import pandas as pd
import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv()

# ─── CONFIG: change these for each import ──────────────────────
EXCEL_FILE = "customers.xlsx"   # your excel file name (must be in same folder)
SLOT_ID    = 8                  # which slot to add these into (check /api/slots for IDs)
MONTH_YEAR = "2026-06"          # which month's LEDGER this batch goes under (e.g. June)
# Note: opening_date stays as the real historical date from the sheet (e.g. 12.9.25 -> 2025-09-12)
# month_year above is just which ledger page it appears under, NOT derived from opening_date.
# ─────────────────────────────────────────────────────────────

def get_db():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "lending_db"),
    )

# Read excel — 4 columns: Opening Date, Customer Name, Funding, Payment Done
# No header row assumed — data starts from row 1. If your sheet HAS a header row, change skiprows=0 to skiprows=1
df = pd.read_excel(EXCEL_FILE, header=None, skiprows=0)
df.columns = ["opening_date", "customer_name", "funding", "payment_done"]
print(f"Loaded {len(df)} rows from {EXCEL_FILE}", flush=True)
print(df.head(), flush=True)

conn = get_db()
cur = conn.cursor()

# get current max sl_no for this slot/month so numbering continues correctly
cur.execute(
    "SELECT COALESCE(MAX(sl_no), 0) FROM customers WHERE slot_id=%s AND month_year=%s",
    (SLOT_ID, MONTH_YEAR)
)
sl_no = cur.fetchone()[0]

inserted = 0
skipped = 0

for idx, row in df.iterrows():
    if pd.isna(row["customer_name"]) or pd.isna(row["funding"]):
        skipped += 1
        continue  # skip blank rows

    try:
        sl_no += 1
        # Opening date format in sheet is DD.MM.YY (e.g. 12.9.25 = 12 Sept 2025)
        raw_date = str(row["opening_date"]).strip()
        opening_date = pd.to_datetime(raw_date, format="%d.%m.%y", dayfirst=True).strftime("%Y-%m-%d")

        customer_name = str(row["customer_name"]).strip()
        funding = float(row["funding"])
        payment_done = float(row["payment_done"]) if not pd.isna(row["payment_done"]) else 0

        cur.execute(
            """INSERT INTO customers
               (slot_id, sl_no, opening_date, customer_name, funding,
                payment_has_been_done, month_year, daily_recovery, is_closed)
               VALUES (%s, %s, %s, %s, %s, %s, %s, 0, 0)""",
            (SLOT_ID, sl_no, opening_date, customer_name, funding, payment_done, MONTH_YEAR)
        )
        inserted += 1
        print(f"  ✓ Row {idx+1}: {customer_name} — opened {opening_date} — ₹{funding} (paid ₹{payment_done}) — added to {MONTH_YEAR}")

    except Exception as e:
        print(f"  ✗ Row {idx+2} FAILED: {e}")
        skipped += 1

conn.commit()
cur.close()
conn.close()

print(f"\n✅ Done. Inserted {inserted} customers into slot {SLOT_ID} under ledger month {MONTH_YEAR}. Skipped {skipped} rows.")