# Themis

An AI-assisted legal comparison system — describe an incident, get the offence
classified, the applicable statute retrieved with a citation and an
official-source link, a confidence score, and a conversational
legal-guidance chatbot that explains it and handles follow-ups.
Cross-country comparison is available as an opt-in secondary mode.

Built for Project Exhibition 1 (AIML branch group project).

## How it's built

- **Backend** (`/backend`): Node.js + Express API. No external services, no
  API keys, no database required — it runs immediately after `npm install`.
  - Offence classification is a small, dependency-free keyword-scoring
    model (`src/services/classifier.js`) — swap it for an embeddings/LLM
    classifier later without touching anything else; every other module
    only depends on the `{ offenceId, label, confidence }` shape it returns.
  - The law data lives in `src/data/lawCorpus.json`: 10 offence categories,
    each with real citations for India (Bharatiya Nyaya Sanhita 2023 / IT
    Act 2000) and the UK, sourced from indiacode.nic.in and
    legislation.gov.uk. A few entries carry a `note` field flagging genuine
    cross-country differences worth knowing (e.g. defamation is a criminal
    offence in India but a civil matter in the UK; the UK has no standalone
    "identity theft" offence and prosecutes it as fraud instead).
  - The chatbot (`src/services/chatbot.js`) is a rule-based conversation
    manager: it classifies the message, asks a clarifying question with
    quick-reply buttons when the match is ambiguous, explains the result
    once resolved, and answers a few follow-up intents (punishment, how to
    file a complaint, compare with another country) using simple pattern
    matching — no LLM required, though the architecture leaves room to
    plug one in later.
- **Frontend** (`/frontend`): plain HTML/CSS/JS, no build step, no framework.
  The backend serves it directly (see below), so there's only one server to
  run and nothing to deploy separately.

## Running it locally

There's only one server — it serves both the API and the frontend.

```bash
cd backend
npm install
cp .env.example .env   # optional, defaults to port 5000
npm start               # or: npm run dev (with nodemon, auto-restarts)
```

Then open **http://localhost:5000** in your browser. That's it — no Live
Server, no second terminal. `frontend/app.js` calls the API at the relative
path `/api`, which always resolves to whatever origin the page is served
from, locally or once deployed.

## Putting it on GitHub

From the project root (this folder):

```bash
git init
git add .
git commit -m "Initial commit: Themis"
```

Then create an empty repository on GitHub (github.com → New repository —
don't initialize it with a README, you already have one), and push:

```bash
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

`.gitignore` already excludes `node_modules/` and `.env`, so you won't
accidentally commit installed packages or secrets.

## Deploying it

Because the backend now serves the frontend too, you only need to deploy
**one** service. [Render](https://render.com) has a free tier and is the
simplest option for a Node/Express app like this:

1. Push the repo to GitHub (above) if you haven't.
2. Go to [render.com](https://render.com) → sign up/log in with GitHub.
3. **New +** → **Web Service** → pick this repository.
4. Set:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Click **Create Web Service**. Render builds it and gives you a live URL
   like `https://nomos-xxxx.onrender.com` — open it, the whole app (frontend
   + API) is right there.

Render sets its own `PORT` environment variable automatically and
`server.js` already reads `process.env.PORT`, so no extra config is needed.
The free tier spins down after periods of inactivity and takes ~30–50s to
wake up on the next request — fine for a demo, worth knowing before you
present live.

(Railway and Fly.io work the same way if you'd rather use one of those —
same three settings: root directory `backend`, build `npm install`, start
`npm start`.)

## API reference

| Endpoint | Method | Body | What it does |
| --- | --- | --- | --- |
| `/api/offences` | GET | — | List all offence categories |
| `/api/jurisdictions` | GET | — | List supported jurisdictions |
| `/api/classify` | POST | `{ text }` | Classify incident text into candidate offences with confidence |
| `/api/lookup` | POST | `{ offenceId, jurisdiction }` | Primary flow: the statute for one offence in one jurisdiction |
| `/api/compare` | POST | `{ offenceId, jurisdictions: [] }` | Secondary flow: the same offence across several jurisdictions |
| `/api/chat` | POST | `{ sessionId, message, jurisdiction, selectedOffenceId? }` | Conversational layer — classifies, clarifies, explains, handles follow-ups |

## What's next (see the project plan doc for the full list)

- Add a third jurisdiction to the corpus once India + UK are solid in the demo
- Swap the keyword classifier for an embeddings/LLM-based one if time allows
- Persist chat sessions (currently in-memory, cleared on server restart)
- Lawyer directory (stretch goal, not built here)

## Data accuracy note

Every statute citation in `lawCorpus.json` was checked against
indiacode.nic.in and legislation.gov.uk before shipping. Punishment
quantum is only included where the source explicitly states it (the IT
Act entries); BNS entries intentionally omit sentencing details rather
than guess. Always click "Verify official source" before relying on
anything in a demo or report — laws change, and this is a student project,
not a law firm.
