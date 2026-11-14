# Event Selector

Agregador personal d'esdeveniments (Igualada, Barcelona i rodalia), consultable des del mòbil i l'ordinador.
El disseny complet i les decisions són a [PROPOSTA.md](PROPOSTA.md).

## Estructura

| Carpeta | Què és |
|---|---|
| `web/` | App Next.js 16 (PWA) — es desplega a Vercel amb *Root Directory* = `web` |
| `pipeline/` | Pipeline Python d'extracció (GitHub Actions + PC de casa per a l'Agenda de Barcelona) |
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
- **Botó «Actualitzar ara»** (Configuració → Fonts): engega el mateix workflow amb totes les fonts i en mostra l'estat.
  Cal la variable `GITHUB_DISPATCH_TOKEN` a Vercel (i a `web/.env.local` per provar-ho en local): un token
  *fine-grained* de GitHub (Settings → Developer settings → Fine-grained tokens) només del repositori
  `event-selector`, amb el permís *Actions: Read and write*. Sense el token, en lloc del botó surt aquest avís.
- **Fonts proposades**: el pipeline proposa els @comptes que mencionen els comptes d'Instagram seguits (perfil via
  l'API de Meta) i, amb `GROQ_API_KEY`, gpt-oss (Groq, gratuït) marca quins semblen organitzar esdeveniments.
- **PC de casa**: l'Agenda de Barcelona (Open Data BCN) respon 403 als servidors de GitHub, així que GitHub Actions
  salta les fonts amb `config.runner = "local"` i les llegeix `pipeline/run-local.cmd` des del PC, amb la tasca
  programada de Windows «Event Selector - Agenda BCN» (cada dia a les 9:00; si el PC estava apagat, en engegar-lo).
  Registre a `pipeline/logs/local-run.log`.
- **Pausa automàtica**: les fonts que funcionen però fa 60 dies que no donen cap pla nou es pausen soles
  (`pipeline/event_pipeline/idle.py`); mai les de sèrie. En reactivar-les a l'app, el comptador torna a començar.
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
