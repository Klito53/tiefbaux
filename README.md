# TiefbauX MVP

Voll funktionsfaehiger MVP fuer den LV-Workflow im Tiefbau:

1. LV als PDF hochladen.
2. Positionen automatisch extrahieren und technisch interpretieren.
3. Passende Artikel aus der Produktdatenbank vorschlagen.
4. Kompatibilitaetsregeln pruefen.
5. Befuelltes Angebot als PDF exportieren.

## Tech Stack

- Frontend: React + TypeScript + Vite
- Backend: FastAPI + SQLAlchemy
- Datenbank: PostgreSQL (MVP kann fuer lokale Entwicklung auch mit SQLite laufen)
- PDF: `pdfplumber` (Parsing), `reportlab` (Angebotsexport)
- KI: Gemini 2.5 Flash optional (Fallback auf lokale Heuristik wenn kein API-Key gesetzt ist)

## Projektstruktur

- `/Users/mirco/TiefbauX/backend` FastAPI API, Matching-Engine, PDF-Export
- `/Users/mirco/TiefbauX/frontend` React MVP UI (3-Spalten-Layout)
- `/Users/mirco/TiefbauX/TiefbauX_Dummy_Datenbank_v2.xlsx - Artikel.csv` Produktkatalog-Quelle

## Schnellstart

### 1) PostgreSQL starten

Option A: lokal vorhandene Postgres-Instanz nutzen.

Option B: mit Compose starten:

```bash
docker compose up -d postgres
```

DB-Zugang fuer Compose-Variante:

- DB: `tiefbaux`
- User: `tiefbaux`
- Passwort: `tiefbaux`
- Port: `5432`

### 2) Backend starten

```bash
cd /Users/mirco/TiefbauX/backend
cp .env.example .env
python3 -m pip install -r requirements.txt
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Hinweise:

- Beim ersten Start werden Tabellen erstellt und die Artikel aus CSV in die DB importiert.
- Ohne `GEMINI_API_KEY` laeuft die Interpretation mit robustem Heuristik-Fallback.

### 3) Frontend starten

```bash
cd /Users/mirco/TiefbauX/frontend
cp .env.example .env
npm install
npm run dev
```

Dann im Browser: `http://localhost:5173`

## API Endpunkte (MVP)

- `POST /api/parse-lv`
  - Input: PDF Upload (`multipart/form-data`, Feld `file`)
  - Output: erkannte/bepreisbare Positionen inkl. technischer Parameter

- `POST /api/suggestions`
  - Input: Positionen aus `parse-lv`
  - Output: 1-3 Artikelvorschlaege je Position + Kompatibilitaetshinweise

- `POST /api/export-offer`
  - Input: Positionen + ausgewaehlte Artikelzuordnung
  - Output: Angebots-PDF (Download)

## Frontend-Workflow

1. Linke Spalte: PDF uploaden und Analyse starten.
2. Mittlere Spalte: erkannte LV-Positionen pruefen/anklicken.
3. Rechte Spalte: Artikelvorschlaege pro Position auswaehlen.
4. Angebot exportieren.

## Umgebungsvariablen

Backend (`/Users/mirco/TiefbauX/backend/.env`):

- `DATABASE_URL` (z. B. `postgresql+psycopg://tiefbaux:tiefbaux@localhost:5432/tiefbaux`)
- `GEMINI_API_KEY` (optional)
- `GEMINI_MODEL` (default `gemini-2.5-flash`)
- `CORS_ORIGINS` (comma separated)

Frontend (`/Users/mirco/TiefbauX/frontend/.env`):

- `VITE_API_BASE_URL` (default `http://localhost:8000/api`)

## MVP Grenzen

- Fokus auf PDF-LVs (GAEB noch nicht enthalten)
- Positionssplit und Parameterextraktion sind auf Robustheit fuer MVP optimiert, nicht auf 100% Vollstaendigkeit jeder LV-Variante
- Kompatibilitaetsengine deckt die wichtigsten Tiefbau-Regeln ab und kann einfach erweitert werden
