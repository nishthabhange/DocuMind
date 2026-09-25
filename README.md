<div align="center">

# 📄 DocuMind

**Turn documents into clear, searchable insights — powered by AI.**

Upload a PDF, Word, or text file and get an instant summary, keywords, and important points. Then search it by meaning or chat with it, all backed by real cloud services: authentication, storage, a vector database, and an AI model.

[Features](#-features) · [How it works](#-how-it-works) · [Tech stack](#-tech-stack) · [Quick start](#-quick-start) · [Project structure](#-project-structure)

</div>

---

## 🖼️ Preview

> *Add a screenshot or a link to the live deployment here once available.*

## ✨ Features

- **🔐 Accounts** — sign up and log in with email and password (Supabase Auth). Every user only ever sees their own documents.
- **📤 Upload & analyze** — upload a PDF, DOCX, or TXT file and get back:
  - a plain-language summary
  - the document type
  - 8–12 keywords
  - the most important points
  - suggested follow-up questions
  - security observations (e.g. obvious phishing text or exposed sensitive info)
- **💬 Chat with your documents (RAG)** — ask a question about one document or all of them. The AI answers only from the retrieved passages, cites them like `[1]`, and shows a confidence score plus the exact source excerpts.
- **🔍 Semantic search** — find a passage by *meaning*, not exact keywords. Searching "staying safe online" can surface a paragraph about "cybersecurity best practices."
- **📊 Dashboard** — total documents, pages, storage used, and searchable chunks at a glance.
- **⬇️ Secure download** — the original file can be downloaded via a link that expires after 5 minutes.
- **🗑️ Delete anytime** — removing a document deletes the file, its record, and its search data.

## 🧠 How it works

```
Browser (HTML + CSS + JS)
        │  login token over HTTPS
        ▼
FastAPI backend
  ├── Supabase Auth      → who is the user?
  ├── Supabase Storage   → original files, in a private bucket
  ├── Supabase Postgres  → document records, analysis, text chunks
  ├── pgvector           → embeddings + similarity search (inside Postgres)
  ├── sentence-transformers → turns text into embeddings, running locally (free, no API limit)
  └── Groq (LLM)         → document analysis + chat answers
```

**Upload → Analyze → Search flow:**

1. **Extract** — text is pulled from the file page by page (PDF/DOCX) or as-is (TXT).
2. **Analyze** — the text is sent to a Groq model, which returns a structured summary, keywords, points, questions, and security notes as JSON.
3. **Chunk & embed** — the text is split into ~1000-character overlapping chunks, and each chunk is turned into a 384-number vector using a local embedding model (`all-MiniLM-L6-v2`) — no API call, no quota.
4. **Store** — the original file goes to Supabase Storage; the analysis, page text, and chunk vectors go to Postgres/pgvector.
5. **Chat / Search** — a question is embedded the same way, the closest chunks are retrieved by vector similarity, and (for chat) Groq answers using only those chunks as context.

> **Note:** this build intentionally uses two separate free services — Groq for language generation, and a local embedding model instead of a cloud embeddings API — so there's no single point of quota failure.

## 🛠️ Tech stack

| Layer | Technology | Why |
|---|---|---|
| Backend | **FastAPI** (Python) | Fast, simple, automatic request validation |
| Auth | **Supabase Auth** | Secure login/sessions without writing our own |
| File storage | **Supabase Storage** | Private cloud storage for original files |
| Database | **Supabase PostgreSQL** | Documents, analysis, and chunk metadata |
| Vector search | **pgvector** | Semantic search inside the same database |
| Embeddings | **sentence-transformers** (`all-MiniLM-L6-v2`) | Runs locally — free, unlimited, no external quota |
| AI analysis & chat | **Groq API** | Fast, free-tier LLM inference with JSON-mode output |
| Frontend | **HTML, CSS, vanilla JavaScript** | No build step, easy to read and modify |

## 🚀 Quick start

```bash
# 1. Clone the repo
git clone <this-repo-url>
cd documind/backend

# 2. Create a virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Add your keys
cp .env.example .env
# then fill in .env with your Supabase and Groq keys

# 5. Run the database setup (once) — see docs/SETUP.md, section 2

# 6. Start the app
uvicorn main:app --reload --port 8000
```

Open **http://localhost:8000** and create an account.

📖 **Full setup guide** (Supabase project setup, database schema, environment variables, troubleshooting): see [`docs/SETUP.md`](docs/SETUP.md).

## 📁 Project structure

```
documind/
├── README.md                 ← you are here
├── docs/
│   └── SETUP.md               ← full setup + troubleshooting guide
└── backend/
    ├── main.py                 ← the entire backend: API, auth, AI, RAG
    ├── schema.sql               ← run once in Supabase to set up the database
    ├── requirements.txt
    └── .env.example              ← copy to .env and fill in your keys
└── frontend/
    ├── index.html                ← page structure
    ├── styles.css                 ← visual theme
    └── app.js                      ← login, upload, chat, search, stats
```

One backend serves the frontend directly, so there's only one server to run.

## 🔒 Security notes

- Passwords are never handled by our code — Supabase Auth manages them.
- The database only allows access through the backend; every query filters by the logged-in user's ID.
- The original file bucket is private; downloads use short-lived signed links.
- Document text sent to the AI is wrapped and explicitly marked as untrusted data, to reduce prompt-injection risk.
- `.env` is git-ignored and must never be committed — see `.env.example` for the variables you need.

## ⚠️ Known limitations

- Scanned/image-only PDFs (no text layer) aren't supported — there's no OCR step in this build.
- Chat has no memory between questions; each question is answered independently.
- The per-user rate limit resets if the server restarts, and isn't shared across multiple server instances.
- Security notes in the analysis are AI observations, not real malware scanning.

## 👥 Contributors

- Nishtha — Government Polytechnic, Pune.

## 📄 License

This project is for academic/educational purposes.
