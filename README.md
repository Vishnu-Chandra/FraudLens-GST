# GST Risk Platform

GST Risk Platform is an investigation-oriented GST fraud intelligence system built for risk screening, anomaly detection, business analysis, and case handling. It combines a React dashboard for analysts, a Node/Express backend for APIs and workflows, MongoDB for operational data, and a Python Isolation Forest service for ML-based fraud scoring.

The project is designed to help investigators move from raw compliance and transaction data to actionable risk signals. It brings together invoice activity, filing behavior, e-way bill gaps, graph-style trading relationships, ML predictions, and case-management workflows in one workspace.

## Problem this project solves

GST fraud investigation usually involves scattered signals:

- invoice trails across multiple counterparties
- mismatches between reported sales and tax paid
- missing e-way bills for otherwise high-value movements
- circular trading behavior hidden inside supply chains
- too many disconnected tools for risk review and escalation

This platform centralizes those signals so an investigator can:

- identify suspicious taxpayers faster
- inspect business-level evidence in context
- run AI-assisted anomaly scoring on demand
- trace risky trading networks
- escalate findings into cases and officer workflows

## Core features

### 1. Executive risk dashboard

- Summary cards for overall platform risk posture
- Charts for activity, invoice matching, and ITC-related metrics
- Top-risk business highlighting and ranked tables
- Quick access to major investigation views

### 2. Business investigation workspace

- GSTIN-based business lookup
- Business-level risk context and supporting metrics
- Detailed taxpayer review flow for investigators
- Feature extraction used by the ML model

### 3. Anomaly detection and review

- Rule-based anomalies seeded from business and filing behavior
- AI-generated anomalies stored as `AI_PREDICTION`
- Real fraud probability, severity, and risk-level assignment
- Auto-assignment of unassigned anomalies to officers

### 4. Supply-network analysis

- Counterparty relationship exploration from invoice data
- Degree-style network features for suspicious movement detection
- Circular-trading indicators through buyer-seller overlap
- Network context used in the ML scoring pipeline

### 5. ITC and return analytics

- ITC overview and return-related analysis views
- GST paid versus collected comparisons
- Filing delay and consistency signals
- Support for seeded tax-return analytics data

### 6. Geographic and state-level monitoring

- State risk map for distribution of risk signals
- Region-aware taxpayer tracking
- Better prioritization for geographically clustered risk

### 7. Case management workflow

- Investigation case listing and detail pages
- Case creation from anomalies
- Officer assignment support
- Structured path from detection to investigation

### 8. Investigation call center and chat support

- Call-center workflow pages for investigation follow-up
- Chat endpoint integration for investigator assistance
- Faster triage and case interaction support

### 9. ML-powered fraud scoring

- Isolation Forest model served through a Python Flask API
- Canonical 11-feature scoring schema
- Fraud probability-like output derived from anomaly score
- On-demand prediction from the backend anomaly routes
- Prediction persistence into MongoDB for auditability

### 10. Synthetic data generation and local demo support

- Deterministic dataset generation for local development
- Fraud-ring, hub, and compliant-trader patterns baked into sample data
- JSON import path for MongoDB-backed demos and testing

## How the platform works

At a high level, the system follows this flow:

1. Business, invoice, GSTR-1, GSTR-3B, and e-way bill data are loaded into MongoDB.
2. The backend builds risk features for a GSTIN from financial and relationship data.
3. The ML service scores the business using an Isolation Forest model.
4. The backend stores or updates an `AI_PREDICTION` anomaly with explanation metadata.
5. The frontend surfaces those results in dashboard, anomaly, case, and business views.

## Tech stack

### Frontend

- React 19
- Vite
- React Router 7
- Recharts
- React Flow
- d3-geo and topojson-client

### Backend

- Node.js
- Express
- Mongoose
- Axios
- Multer
- Optional Neo4j integration

### ML service

- Python
- Flask
- pandas
- numpy
- scikit-learn
- joblib

### Data stores

- MongoDB for operational application data
- Optional Neo4j for graph-backed analysis extensions

## Repository structure

```text
backend/     Express API, models, controllers, routes, and business services
frontend/    React dashboard and investigation UI
ml-model/    Isolation Forest training code and Flask inference API
data/        Local JSON source data used to seed MongoDB
dataset/     Optional generated dataset output (ignored by Git)
```

## Key frontend views

The current UI includes these major views:

- Dashboard
- Business detail by GSTIN
- Business investigation
- Supply network
- ITC analysis
- State risk map
- Anomalies
- Cases
- Case details
- Investigation call center

## Key backend capabilities

The backend currently exposes APIs for:

- uploads
- analysis
- graph operations
- AI prediction
- business data
- dashboard metrics
- anomalies
- cases
- analytics
- calls
- chat

The backend also bootstraps default officers, initial anomalies, and initial cases during startup.

## ML model details

The ML layer uses Isolation Forest rather than a supervised classifier. That matters because this project is optimized for anomaly detection in suspicious behavioral patterns, not only for labeled fraud/non-fraud history.

The model scores each business using a fixed 11-feature schema:

- `invoiceCount`
- `totalTaxableValue`
- `itcRatio`
- `lateFilingsCount`
- `missingEwayRatio`
- `gstPaidVsCollectedRatio`
- `degreeCentrality`
- `outDegree`
- `inDegree`
- `cycleParticipation`
- `avgNeighborRisk`

These features mix financial behavior and trading-network behavior, which makes the scoring more useful than a purely filing-based heuristic.

## Dataset and demo data

The project includes a generator for synthetic GST activity in [generate_dataset.py](generate_dataset.py). The generated data intentionally models different business behaviors, including:

- circular fraud-ring traders
- high-activity hubs
- compliant regular traders
- medium-risk partially compliant traders

The generator produces:

- businesses
- invoices
- GSTR-1 records
- GSTR-3B records
- e-way bills

This makes the repo usable for demos, local testing, and workflow validation without depending on production data.

## Prerequisites

- Node.js 18 or newer
- Python 3.11 or newer, or a working virtual environment
- MongoDB running locally on port 27017
- Optional Neo4j if you want graph-backed analysis features enabled

## Setup

### 1. Install dependencies

From the workspace root:

```powershell
npm install
cd backend
npm install
cd ../frontend
npm install
cd ..
```

### 2. Configure environment files

Backend:

```powershell
cd backend
copy .env.example .env
```

Frontend:

```powershell
cd frontend
copy .env.example .env
```

Recommended frontend setting:

```env
VITE_ENABLE_API_FALLBACK=false
```

Recommended backend settings for local development:

```env
MONGO_URI=mongodb://127.0.0.1:27017/gst_platform
ML_API_URL=http://localhost:6001
NEO4J_ENABLED=false
```

If Neo4j is available locally, set `NEO4J_ENABLED=true` and fill the connection variables from `backend/.env.example`.

### 3. Create or reuse a Python virtual environment

If `.venv` does not exist yet:

```powershell
python -m venv .venv
```

Install ML dependencies:

```powershell
.\.venv\Scripts\python.exe -m pip install -r ml-model/requirements.txt
```

### 4. Train the ML model

```powershell
cd ml-model
..\.venv\Scripts\python.exe train_model.py
cd ..
```

This creates `ml-model/fraud_model.pkl`, which is intentionally ignored by Git.

### 5. Start the services

ML API:

```powershell
cd ml-model
..\.venv\Scripts\python.exe app.py
```

Backend API:

```powershell
cd backend
npm run dev
```

Frontend:

```powershell
cd frontend
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`
- ML API: `http://localhost:6001`

## Loading data into MongoDB

The backend uses `gst_platform` by default. If the database is empty, load the JSON files from `data/`.

Example from `backend/`:

```powershell
node -e "const fs=require('fs'); const path=require('path'); const mongoose=require('mongoose'); const root=path.resolve('..'); const load=(name)=>JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8')); const normalizeInvoices=(rows)=>rows.map(r=>({...r, invoice_date:r.invoice_date?new Date(r.invoice_date):undefined})); mongoose.connect('mongodb://127.0.0.1:27017/gst_platform').then(async()=>{ const db=mongoose.connection.db; const datasets={ businesses: load('businesses.json'), invoices: normalizeInvoices(load('invoices.json')), gstr1: load('gstr1.json'), gstr3bs: load('gstr3b.json'), ewaybills: load('ewaybills.json') }; for (const [name, rows] of Object.entries(datasets)) { await db.collection(name).deleteMany({}); if (rows.length) await db.collection(name).insertMany(rows); console.log(name + ': ' + rows.length); } await mongoose.disconnect(); }).catch(err=>{ console.error(err); process.exit(1);});"
```

## Common development workflow

### Run a real anomaly prediction

Once MongoDB, backend, and the ML API are running, trigger prediction for a business with:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/anomalies/detect/<GSTIN>
```

This will:

- build the feature vector for the GSTIN
- call the ML API
- create or update an `AI_PREDICTION` anomaly in MongoDB
- return the prediction and saved anomaly payload

### Check ML health

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:6001/health
```

## Important endpoints

### Backend

- `GET /api/dashboard/summary`
- `GET /api/anomalies`
- `POST /api/anomalies/detect/:gstin`
- `POST /api/ai/predict`
- `GET /api/cases`
- `GET /api/business`
- `GET /api/analytics/itc-overview`

### ML API

- `GET /health`
- `POST /predict`
- `POST /predict-batch`

## Git and local-file policy

The repository intentionally does not track:

- `.env` files and secrets
- local Python virtual environments
- trained ML artifacts such as `fraud_model.pkl`
- uploads in `backend/uploads/`
- generated dataset output in `dataset/`
- logs, caches, temporary files, and editor state

This keeps the repo cleaner and makes GitHub pushes safer.

## Notes for contributors

- Keep frontend fallback disabled during normal development so backend failures are visible.
- If Neo4j is not available, use `NEO4J_ENABLED=false`.
- The ML service and backend must agree on the 11-feature schema.
- Generated or machine-local files should stay ignored rather than committed.

## Current status

The platform currently supports end-to-end local testing where:

- MongoDB is seeded from `data/`
- the ML model is trained and served locally
- the backend calls the ML API successfully
- anomaly detection creates real `AI_PREDICTION` records for stored businesses

That makes this repository usable as both a working demo and a development baseline for further investigation features.