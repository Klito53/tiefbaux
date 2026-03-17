# TiefbauX

LV-Analyse-Tool fuer den Tiefbau-Workflow bei Fassbender Tenten:

1. Leistungsverzeichnis als PDF hochladen
2. Positionen automatisch extrahieren und technisch interpretieren (Gemini LLM)
3. Passende Artikel aus der Produktdatenbank matchen (3.300+ Produkte)
4. Zuordnung im Widget-basierten Workflow pruefen und anpassen
5. Angebot als PDF exportieren

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** FastAPI + SQLAlchemy + SQLite
- **PDF:** pdfplumber (Parsing), reportlab (Angebotsexport)
- **KI:** Gemini Flash (PDF-Parsing + Parameter-Enrichment)

## Voraussetzungen

- Python 3.11+
- Node.js 18+
- Gemini API Key ([Google AI Studio](https://aistudio.google.com/))

## Schnellstart

### 1) Backend

```bash
cd backend

# Virtuelle Umgebung erstellen & aktivieren
python3 -m venv .venv
source .venv/bin/activate   # macOS/Linux
# .venv\Scripts\activate    # Windows

# Dependencies installieren
pip install -r requirements.txt

# Umgebungsvariablen konfigurieren
cp .env.example .env
# .env bearbeiten und GEMINI_API_KEY eintragen

# Server starten
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Die SQLite-Datenbank (`tiefbaux.db`) mit dem Produktkatalog ist bereits im Repository enthalten.

### 2) Frontend

```bash
cd frontend

# Dependencies installieren
npm install

# .env anlegen
cp .env.example .env

# Dev-Server starten
npm run dev
```

Dann im Browser: http://localhost:5173

## Umgebungsvariablen

**Backend** (`backend/.env`):

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./tiefbaux.db` | Datenbank-URL |
| `GEMINI_API_KEY` | - | Google Gemini API Key (erforderlich fuer LV-Analyse) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini-Modell |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Erlaubte Origins |

**Frontend** (`frontend/.env`):

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:8000/api` | Backend-API-URL |

## Projektstruktur

```
backend/
  app/
    api/routes.py          # API-Endpoints
    services/
      llm_parser.py        # PDF-Parsing via Gemini LLM
      ai_interpreter.py    # Parameter-Enrichment (Heuristik + Gemini)
      matcher.py           # Produkt-Matching-Engine (Multi-Faktor-Scoring)
      offer_export.py      # Angebots-PDF-Export
    models.py              # SQLAlchemy-Modelle
    schemas.py             # Pydantic-Schemas
    config.py              # Settings aus .env
  scripts/                 # Import-Scripts fuer Produktdaten
  tiefbaux.db              # SQLite DB (3.300+ Produkte)

frontend/
  src/
    hooks/useAnalysis.ts   # Haupt-State-Management
    components/            # React-Komponenten
    api.ts                 # Backend-API-Client
    types.ts               # TypeScript-Typen
```

## Produktdatenbank

Aktuell 3.300 Produkte von 4 Herstellern:

| Hersteller | Produkte | Sortiment |
|------------|----------|-----------|
| ACO | 1.909 | Rinnen, Hofablaeufe, Strassenentwaesserung |
| Wavin | 826 | KG/PP-Rohre, Schachtbauteile, Versickerung |
| Muffenrohr | 339 | KG PVC-U SN4, PP SN10 gruen (Eigenmarken) |
| REHAU | 226 | AWADUKT HPP SN10/16 |
