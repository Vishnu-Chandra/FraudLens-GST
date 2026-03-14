# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Project Runbook (GST Risk)

This UI depends on backend and ML services.

### 1) Start ML API (Isolation Forest)

From workspace root:

```powershell
cd ml-model
..\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt
..\\.venv\\Scripts\\python.exe train_model.py
..\\.venv\\Scripts\\python.exe app.py
```

ML health endpoint:

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:6001/health
```

### 2) Start Backend API

Create backend env from template and set values:

```powershell
cd backend
copy .env.example .env
```

Important env values:

- `MONGO_URI`
- `ML_API_URL=http://localhost:6001`

Run backend:

```powershell
npm install
npm run dev
```

### 3) Start Frontend

Create frontend env from template:

```powershell
cd frontend
copy .env.example .env
```

`VITE_ENABLE_API_FALLBACK=false` is recommended for development/prod so API failures are not hidden.

Run frontend:

```powershell
npm install
npm run dev
```

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
