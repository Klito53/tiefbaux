# TiefbauX

Web application for analyzing LV (Leistungsverzeichnis) files from construction projects.

## Project Structure

- `frontend/` - React + Vite frontend application
- `backend/` - FastAPI backend application

## Getting Started

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:5173

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs on http://localhost:8000

## Features

- Upload LV files (PDFs)
- Extract and detect LV positions
- Display positions in a table
- Category and supplier suggestions (coming soon)

