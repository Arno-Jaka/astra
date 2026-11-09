# ASTRA

Interplanetary Survival Guide: Martian Map — NASA Space Apps Challenge 2026.

An interactive Mars excursion planner: fly to a site, read a sourced survival
briefing and nearest live conditions, plan a slope-limited traverse, and watch a
rover scout drive it.

## Stack
- `backend/` — FastAPI (Python 3.11, uv), Agno + Groq commander, deterministic
  elevation/slope/route services, edge-tts.
- `frontend/` — Vite + React + TypeScript, CesiumJS (Mars), Zod, Zustand, Tailwind.

## Run (dev)
Backend:
```sh
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```
Frontend:
```sh
cd frontend
npm install
npm run dev
```
Health: `GET http://localhost:8000/health`

Copy `.env.example` to `backend/.env` and fill keys. Never commit `.env`.
