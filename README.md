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

## Seguretat
El repositori és **públic**: cap clau, llista de fonts ni compte va al codi. Les claus van a `.env` / `.env.local`
(ignorats per git) i als *Secrets* de GitHub; les fonts viuen a Supabase.
