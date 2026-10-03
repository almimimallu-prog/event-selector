# Event Selector

Agregador personal d'esdeveniments (Igualada, Barcelona i rodalia), consultable des del mòbil i l'ordinador.
El disseny complet i les decisions són a [PROPOSTA.md](PROPOSTA.md).

## Estructura

| Carpeta | Què és |
|---|---|
| `web/` | App Next.js 16 (PWA) — es desplega a Vercel amb *Root Directory* = `web` |
| `pipeline/` | Pipeline Python d'extracció (GitHub Actions + PC de casa per a Instagram) |
| `supabase/migrations/` | Esquema de la base de dades |

## Posada en marxa

### Web
```bash
cd web
cp .env.example .env.local   # i omple els valors
npm install
npm run dev                  # http://localhost:3000
```

### Pipeline
```bash
cd pipeline
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"   # Windows (a Linux/macOS: .venv/bin/python)
cp .env.example .env         # i omple els valors
.venv/Scripts/python -m pytest
```

### Base de dades
Aplica els fitxers de `supabase/migrations/` per ordre (Supabase → SQL Editor, o `supabase db push` amb la CLI).
Després, a **Authentication → Sign In / Providers**, desactiva *Allow new users to sign up*: l'app és d'un sol usuari.

## Publicació i automatització

- **Web**: Vercel, projecte `event-selector`, *Root Directory* = `web`, regió `fra1` (`web/vercel.json`).
  Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Cada push a `main` publica.
  Cal afegir l'adreça de Vercel a Supabase → Authentication → URL Configuration (Redirect URLs).
- **Pipeline**: GitHub Actions (`.github/workflows/pipeline.yml`) cada 6 hores, o a mà des de la pestanya
  Actions → Pipeline → Run workflow. Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
  `EVENTBRITE_TOKEN`.
- **Zones i fonts**: s'editen a l'app (Configuració). Una font nova es comprova contra el `robots.txt` i se'n tria
  l'adaptador (WordPress/The Events Calendar, schema.org/Event o Gemini); les d'Eventbrite les completa el pipeline
  amb l'API. També des de la terminal: `python -m event_pipeline.manage eventbrite-add <enllaç>` (des de `pipeline/`).
- **Instagram**: API oficial de Meta (*Business Discovery*), només comptes professionals; Gemini llegeix el text i el
  cartell de les publicacions noves (una crida per compte). Cal un compte d'Instagram professional propi vinculat a una
  pàgina de Facebook i una app de Meta en mode desenvolupament; `python -m event_pipeline.manage instagram-setup` desa
  `INSTAGRAM_TOKEN` i `INSTAGRAM_USER_ID` a `pipeline/.env` (cal copiar-los també als Secrets de GitHub). Els comptes
  s'afegeixen a l'app (Configuració → Fonts, `@compte`) o amb `instagram-add`.
- **Meetup i calendaris .ics**: l'API de Meetup és només per a Meetup Pro; es llegeix el calendari iCal públic de cada
  grup (`meetup.com/<grup>/events/ical/`). A l'app n'hi ha prou d'enganxar l'enllaç del grup; també `ics-add`.

## Seguretat
El repositori és **públic**: cap clau, llista de fonts ni compte va al codi. Les claus van a `.env` / `.env.local`
(ignorats per git) i als *Secrets* de GitHub; les fonts viuen a Supabase.
