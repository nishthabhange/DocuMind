# Setup Guide

Full setup instructions for DocuMind, including the Supabase database and troubleshooting. If you just want the short version, see the main [README](../README.md#-quick-start).

## 1. What you need

| Requirement | Notes |
|---|---|
| Python 3.10+ | Check with `python --version` (macOS: `python3 --version`) |
| A free Supabase account | https://supabase.com |
| A free Groq API key | https://console.groq.com/keys |
| Internet connection | Needed for Supabase, Groq, and the fonts/library CDNs the frontend loads |

## 2. Set up Supabase

1. Create a **New project** at supabase.com. Save the database password.
2. Open **SQL Editor → New query**, paste the full contents of `backend/schema.sql`, and run it. This creates:
   - the `documents` and `chunks` tables
   - the pgvector extension and a fast vector index (384-dimension, matching the local embedding model)
   - the `match_chunks` search function
   - a **private** storage bucket named `documents`
3. Get your keys from **Project Settings → API**:
   - **Project URL**
   - **Publishable key** (older projects: `anon` key)
   - **Secret key** (older projects: `service_role` key)
4. While testing, you can turn off **Authentication → Sign In / Providers → Email → Confirm email** so you don't need to click a confirmation link after signing up.

## 3. Get a Groq API key

Go to `console.groq.com/keys` and create a key. It's free, with generous rate limits.

## 4. Create `.env`

Copy `backend/.env.example` to `backend/.env` and fill in your values:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
SUPABASE_SECRET_KEY=your-secret-or-service-role-key
GROQ_API_KEY=your-groq-key
```

`SUPABASE_URL` must be the **project's API URL** (`https://<project-id>.supabase.co`) — not the dashboard link (`supabase.com/dashboard/project/...`). Using the dashboard link is a common mistake and causes "Failed to fetch" on login.

Optional settings (defaults shown):

```env
SUPABASE_BUCKET=documents
GROQ_MODEL=openai/gpt-oss-20b
MAX_FILE_SIZE_MB=20
MAX_PAGES=200
```

> **Never commit `.env`.** It holds your secret keys. It's already listed in `.gitignore`.

## 5. Install and run

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Open **http://localhost:8000**. The first upload will take a little longer than usual, since the local embedding model (~90 MB) downloads once on first use.

## 6. Using the app

1. Create an account (email + password, 6+ characters), then log in.
2. **Documents** — upload a PDF, DOCX, or TXT file. Analysis takes a few seconds to about a minute.
3. Open a document to see the summary, keywords, points, and security notes. Click a suggested question to ask it in Chat.
4. **Chat** — pick one document or "All my documents" and ask questions; answers cite the source passages.
5. **Search** — find passages by meaning.
6. **Statistics** — see totals across your documents.

## 7. Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| `RuntimeError: Set SUPABASE_URL...` on start | `.env` is missing, in the wrong folder (must be inside `backend/`), or has an empty value |
| `ModuleNotFoundError` | Dependencies aren't installed in the active virtual environment — run `pip install -r requirements.txt` |
| Login/signup says "Failed to fetch" | `SUPABASE_URL` is wrong — check it's `https://<id>.supabase.co`, not the dashboard link. Also confirm the server was restarted after editing `.env` |
| Login says "Invalid login credentials" | Wrong password, or email not confirmed yet (see step 2.4) |
| "Please log in again." | Session expired — log in again |
| "AI service is temporarily unavailable" on upload | Check `GROQ_API_KEY` and `GROQ_MODEL`. The real error is printed in the terminal running `uvicorn` |
| "No readable text found. Scanned/image-only PDFs..." | Expected — this build has no OCR step. Use a PDF with a real text layer |
| "Cloud storage or database is unavailable" | Did you run `schema.sql`? Are `SUPABASE_URL`/`SUPABASE_SECRET_KEY` correct? Check the terminal for details |
| Download button does nothing | Should now open a new tab and show an alert on failure. If it still does nothing, check the browser's console (F12) |
| `uvicorn: command not found` or `Error loading ASGI app` | You're not in the `backend` folder, or the virtual environment isn't activated |

## 8. Deploying

The app is already cloud-based (auth, storage, database, and AI all run in the cloud) — only the FastAPI server itself needs a host once you're ready to share a public link. Any Python host works (Render, Railway, Fly.io):

- Install command: `pip install -r backend/requirements.txt`
- Start command (from `backend/`): `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Add the four environment variables from step 4 in the host's dashboard.
- Add the deployed URL to `allow_origins` in `backend/main.py` if the frontend is served from a different domain.
