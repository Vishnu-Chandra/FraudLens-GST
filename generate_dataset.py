"""
GST Risk Intelligence Platform — Synthetic Dataset Generator
============================================================
Produces 5 MongoDB-compatible JSON files:
  businesses.json  invoices.json  gstr1.json  gstr3b.json  ewaybills.json

Run:  python generate_dataset.py
Then import with:
  mongoimport --db gst_risk --collection businesses --jsonArray --file businesses.json
  (repeat for each collection)
"""

import json
import random
import os

# ── Seed for reproducibility ────────────────────────────────────────
random.seed(42)

# ── Output directory ─────────────────────────────────────────────────
OUT_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(OUT_DIR, exist_ok=True)

# ── State codes used in GSTIN prefix ────────────────────────────────
STATES = [
    ("29", "Karnataka"), ("27", "Maharashtra"), ("07", "Delhi"),
    ("33", "Tamil Nadu"), ("36", "Telangana"), ("32", "Kerala"),
    ("24", "Gujarat"),   ("09", "Uttar Pradesh"), ("03", "Punjab"),
    ("06", "Haryana"),
]

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]


# ────────────────────────────────────────────────────────────────────
# 1. BUSINESSES
# ────────────────────────────────────────────────────────────────────

# Fixed businesses (fraud ring + hubs + compliant traders)
BUSINESS_DEFS = [
    # ── Circular Fraud Ring (4 traders) ──────────────────────────────
    ("29", "AAAAA1111A", "1Z5", "Alpha Traders",        "Karnataka"),
    ("27", "BBBBB2222B", "2Z6", "Beta Distributors",    "Maharashtra"),
    ("07", "CCCCC3333C", "3Z7", "Gamma Suppliers",      "Delhi"),
    ("33", "DDDDD4444D", "4Z8", "Delta Retail",         "Tamil Nadu"),

    # ── High-Activity Hubs ────────────────────────────────────────────
    ("36", "EEEEE5555E", "5Z9", "Urban Mart",           "Telangana"),
    ("32", "FFFFF6666F", "6Z1", "Capital Supply",       "Kerala"),

    # ── Regular Compliant Traders ─────────────────────────────────────
    ("24", "GGGGG7777G", "7Z2", "Gujarat Exports",      "Gujarat"),
    ("09", "HHHHH8888H", "8Z3", "UP Trade House",       "Uttar Pradesh"),
    ("03", "IIIII9999I", "9Z4", "Punjab Agro",          "Punjab"),
    ("06", "JJJJJ1010J", "1Z6", "Haryana Industrials",  "Haryana"),
    ("29", "KKKKK2020K", "2Z7", "Bangalore Tech Corp",  "Karnataka"),
    ("27", "LLLLL3030L", "3Z8", "Mumbai Wholesale",     "Maharashtra"),
    ("33", "MMMMM4040M", "4Z9", "Chennai Logistics",    "Tamil Nadu"),
    ("36", "NNNNN5050N", "5Z1", "Hyderabad Pharma",     "Telangana"),

    # ── Medium-Risk Traders (partial compliance) ──────────────────────
    ("07", "OOOOO6060O", "6Z2", "Delhi Distribution",   "Delhi"),
    ("32", "PPPPP7070P", "7Z3", "Kerala Spices",        "Kerala"),
    ("24", "QQQQQ8080Q", "8Z4", "Surat Textiles",       "Gujarat"),
    ("09", "RRRRR9090R", "9Z5", "Lucknow Traders",      "Uttar Pradesh"),
    ("03", "SSSSS1122S", "1Z7", "Amritsar Goods",       "Punjab"),
    ("06", "TTTTT2233T", "2Z8", "Gurgaon Ventures",     "Haryana"),
]

businesses = []
for state_code, pan_chunk, suffix, name, state in BUSINESS_DEFS:
    gstin = f"{state_code}{pan_chunk}{suffix}"
    businesses.append({"gstin": gstin, "name": name, "state": state})

GSTINS = [b["gstin"] for b in businesses]

# Named references for readability
FRAUD_RING   = GSTINS[0:4]   # Alpha → Beta → Gamma → Delta
HUB_A        = GSTINS[4]     # Urban Mart
HUB_B        = GSTINS[5]     # Capital Supply
REGULAR      = GSTINS[6:14]  # Fully compliant
MEDIUM_RISK  = GSTINS[14:]   # Partially compliant


# ────────────────────────────────────────────────────────────────────
# 2. INVOICES
# ────────────────────────────────────────────────────────────────────

def make_invoice(inv_id, seller, buyer, month, amount=None):
    if amount is None:
        amount = random.randint(50_000, 1_50_000)
    gst = round(amount * 0.18)
    return {
        "invoice_id":   inv_id,
        "seller_gstin": seller,
        "buyer_gstin":  buyer,
        "amount":       amount,
        "gst_amount":   gst,
        "month":        month,
    }


invoices = []
inv_counter = 1

def next_id():
    global inv_counter
    iid = f"INV{str(inv_counter).zfill(4)}"
    inv_counter += 1
    return iid


# ── 2a. Circular Fraud Ring (12 invoices — 2 per month × 3 edges extra) ──
RING_EDGES = [
    (FRAUD_RING[0], FRAUD_RING[1]),   # Alpha → Beta
    (FRAUD_RING[1], FRAUD_RING[2]),   # Beta  → Gamma
    (FRAUD_RING[2], FRAUD_RING[3]),   # Gamma → Delta
    (FRAUD_RING[3], FRAUD_RING[0]),   # Delta → Alpha  ← closes the loop
]
for month in MONTHS[:3]:             # Jan–Mar (2 rounds)
    for seller, buyer in RING_EDGES:
        invoices.append(make_invoice(next_id(), seller, buyer, month,
                                     amount=random.randint(80_000, 1_20_000)))

# ── 2b. Hub A (Urban Mart) — many buyers and sellers ─────────────────
HUB_A_PARTNERS = REGULAR[:6]        # 6 regular traders
for month in MONTHS:
    for partner in HUB_A_PARTNERS:
        # Partner sells TO hub
        invoices.append(make_invoice(next_id(), partner, HUB_A, month))
        # Hub sells TO partner
        invoices.append(make_invoice(next_id(), HUB_A, partner, month))

# ── 2c. Hub B (Capital Supply) ────────────────────────────────────────
HUB_B_PARTNERS = REGULAR[2:8]
for month in MONTHS[:4]:
    for partner in HUB_B_PARTNERS:
        invoices.append(make_invoice(next_id(), HUB_B, partner, month))
    # Hub B also trades with Hub A
    invoices.append(make_invoice(next_id(), HUB_A, HUB_B, month))

# ── 2d. Normal compliant regular trader invoices ─────────────────────
for _ in range(60):
    seller, buyer = random.sample(REGULAR, 2)
    invoices.append(make_invoice(next_id(), seller, buyer, random.choice(MONTHS)))

# ── 2e. Medium-risk trader invoices (some will be non-compliant) ─────
for _ in range(30):
    seller = random.choice(MEDIUM_RISK)
    buyer  = random.choice([g for g in GSTINS if g != seller])
    invoices.append(make_invoice(next_id(), seller, buyer, random.choice(MONTHS)))

# ── 2f. Fraud ring traders also trade normally to look legitimate ─────
for _ in range(16):
    seller = random.choice(FRAUD_RING)
    buyer  = random.choice([g for g in REGULAR if g != seller])
    invoices.append(make_invoice(next_id(), seller, buyer, random.choice(MONTHS)))

print(f"✅  invoices generated: {len(invoices)}")

ALL_INV_IDS = [inv["invoice_id"] for inv in invoices]


# ────────────────────────────────────────────────────────────────────
# 3. GSTR1  (reported sales — ~70% of invoices)
# ────────────────────────────────────────────────────────────────────

# Always report the pure-regular invoices, skip some medium-risk & fraud
def should_report_gstr1(inv):
    seller = inv["seller_gstin"]
    if seller in MEDIUM_RISK:
        return random.random() < 0.60   # 60% chance of reporting
    if seller in FRAUD_RING:
        return random.random() < 0.70   # 70% (look mostly legitimate)
    return random.random() < 0.88       # 88% for regular/hub traders

gstr1 = [
    {"invoice_id": inv["invoice_id"], "seller_gstin": inv["seller_gstin"]}
    for inv in invoices if should_report_gstr1(inv)
]
print(f"✅  gstr1 records: {len(gstr1)} / {len(invoices)}")

REPORTED_IDS = {r["invoice_id"] for r in gstr1}
UNREPORTED_IDS = set(ALL_INV_IDS) - REPORTED_IDS
print(f"   ⚠  unreported invoices (mismatch bait): {len(UNREPORTED_IDS)}")


# ────────────────────────────────────────────────────────────────────
# 4. GSTR3B  (actual tax paid per business)
# ────────────────────────────────────────────────────────────────────

def total_gst_collected(gstin):
    return sum(inv["gst_amount"] for inv in invoices if inv["seller_gstin"] == gstin)

gstr3b = []
for biz in businesses:
    gstin      = biz["gstin"]
    collected  = total_gst_collected(gstin)
    if collected == 0:
        collected = random.randint(5_000, 20_000)

    if gstin in FRAUD_RING:
        # Pay significantly less — suspicious ITC abuse
        tax_paid = int(collected * random.uniform(0.30, 0.55))
    elif gstin in MEDIUM_RISK:
        # Pay somewhat less
        tax_paid = int(collected * random.uniform(0.65, 0.90))
    else:
        # Pay close to full amount (small variation is normal)
        tax_paid = int(collected * random.uniform(0.92, 1.00))

    gstr3b.append({"gstin": gstin, "tax_paid": tax_paid})

print(f"✅  gstr3b records: {len(gstr3b)}")


# ────────────────────────────────────────────────────────────────────
# 5. EWAYBILLS  (~65% coverage)
# ────────────────────────────────────────────────────────────────────

def should_have_eway(inv):
    seller = inv["seller_gstin"]
    if seller in MEDIUM_RISK:
        return random.random() < 0.55
    if seller in FRAUD_RING:
        return random.random() < 0.60
    return random.random() < 0.80

ewaybills = []
ewb_counter = 1
for inv in invoices:
    if should_have_eway(inv):
        ewaybills.append({
            "eway_id":    f"EWB{str(ewb_counter).zfill(5)}",
            "invoice_id": inv["invoice_id"],
        })
        ewb_counter += 1

print(f"✅  ewaybills: {len(ewaybills)} / {len(invoices)}")
EWAY_COVERED = {e["invoice_id"] for e in ewaybills}
print(f"   ⚠  missing eWay bills: {len(invoices) - len(EWAY_COVERED)}")


# ────────────────────────────────────────────────────────────────────
# 6. WRITE OUTPUT FILES
# ────────────────────────────────────────────────────────────────────

def write_json(name, data):
    path = os.path.join(OUT_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"📄  {name:20s}  →  {len(data):4d} records  [{path}]")

print("\n── Writing files ──────────────────────────────────────────────")
write_json("businesses.json", businesses)
write_json("invoices.json",   invoices)
write_json("gstr1.json",      gstr1)
write_json("gstr3b.json",     gstr3b)
write_json("ewaybills.json",  ewaybills)

# ── Summary ───────────────────────────────────────────────────────────
print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GST Synthetic Dataset Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Businesses   : {len(businesses):>4}  ({len(FRAUD_RING)} fraud ring, 2 hubs, rest regular/medium)
Invoices     : {len(invoices):>4}
GSTR1 Filed  : {len(gstr1):>4}  ({len(UNREPORTED_IDS)} unreported — reconciliation bait)
GSTR3B Filed : {len(gstr3b):>4}  (4 fraud ring traders under-paying tax)
eWay Bills   : {len(ewaybills):>4}  ({len(invoices)-len(EWAY_COVERED)} missing — logistics anomalies)

Fraud patterns embedded:
  ◉ Circular trading loop  : {FRAUD_RING[0]} → ... → {FRAUD_RING[3]} → (back)
  ◉ High-activity hub      : Urban Mart ({HUB_A}) & Capital Supply ({HUB_B})
  ◉ ITC abuse suspects     : all 4 fraud-ring GSTINs
  ◉ Missing GSTR1 entries  : {len(UNREPORTED_IDS)} invoices unaccounted for
  ◉ Missing eWay bills     : {len(invoices)-len(EWAY_COVERED)} transport anomalies
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Import with:
  cd data
  mongoimport --db gst_risk --collection businesses --jsonArray --file businesses.json
  mongoimport --db gst_risk --collection invoices   --jsonArray --file invoices.json
  mongoimport --db gst_risk --collection gstr1      --jsonArray --file gstr1.json
  mongoimport --db gst_risk --collection gstr3b     --jsonArray --file gstr3b.json
  mongoimport --db gst_risk --collection ewaybills  --jsonArray --file ewaybills.json
""")
