# Event Selector — Proposta de disseny (v1.0)

> Agregador personal d'esdeveniments i activitats (Igualada, Barcelona i rodalia), consultable des del mòbil i l'ordinador.
> Document de referència del projecte. Data: 2026-10-01.

---

## 1. Objectiu

Reunir en una sola aplicació els esdeveniments de moltes fonts (webs, agendes oficials, Instagram, Telegram, WhatsApp, newsletters) per tenir una visió global de la setmana i poder apuntar-se fàcilment als que interessen.

## 2. Restriccions i decisions generals

| Tema | Decisió |
|---|---|
| Usuaris | **Un sol usuari** (accés per *magic link*, sense registre) |
| Pressupost | **0 € estricte** — només nivells gratuïts |
| Dispositiu | Mòbil **Android** (PWA instal·lable) + ordinador |
| Àmbit | Zones **Igualada** (30 km) i **Barcelona** (15 km), configurables (multi-zona amb radi) |
| Categories | Cultura · Esport/natura · Formació/tech · Gastronomia/social |
| Disponibilitat | Feiners a partir de les 18 h i caps de setmana (editable) |
| Proximitat | Distància en km (PostGIS), sense temps de viatge |
| Repositori | GitHub **públic** → fonts, comptes i claus mai al codi (Supabase + Secrets) |
| Idioma UI | Català |

## 3. Stack tècnic

| Capa | Tecnologia |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind 4, **PWA** amb Web Share Target |
| Hosting | Vercel Hobby |
| BD / Auth | Supabase Free (Postgres + `pg_trgm` + PostGIS) |
| Pipeline | Python (httpx, Playwright puntual, extruct, icalendar, trafilatura, pydantic) a **GitHub Actions** (cron cada 6 h) |
| LLM | **Gemini Flash** (API gratuïta, AI Studio): text + imatge + PDF amb sortida JSON estructurada. **Groq** com a alternativa de text si s'esgota la quota |
| Instagram | **Instaloader** amb compte secundari, executat al **PC de casa** (Programador de tasques, 1 cop/dia, s'executa en encendre si s'ha perdut) |
| Telegram | **Telethon** (canals públics) + **bot** propi (safata d'entrada, webhook a Vercel) |
| Newsletters | Gmail amb filtre/etiqueta `EventSelector`, lectura per IMAP |
| Geocodificació | Nominatim (amb memòria cau) + etiquetes d'accessibilitat d'OpenStreetMap |
| Temps | Open-Meteo (activitats a l'aire lliure) |

### On s'executa cada peça

```
┌ GitHub Actions (cron 6 h) ─────────┐  ┌ PC de casa (1/dia) ┐  ┌ Vercel (sempre actiu) ───────┐
│ webs, API, ICS, RSS, Telegram,     │  │ Instagram          │  │ Webhook bot de Telegram      │
│ Gmail · dedup · rànquing · salut   │  │ (Instaloader)      │  │ Web Share Target (Android)   │
└──────────────┬─────────────────────┘  └─────────┬──────────┘  └──────────────┬───────────────┘
               └───────────────► Supabase (raw_items → events) ◄──────────────┘
```

## 4. Gestor de fonts (Source Manager)

- **Fonts llavor**: Agenda Cultural de Catalunya (dades obertes Generalitat), Open Data BCN, agendes d'Igualada i l'Anoia (Ajuntament, Teatre de l'Aurora, Ateneu Igualadí, Biblioteca, Museu de la Pell, diaris locals), Meetup/Eventbrite, calendaris de curses i centres excursionistes. *(A verificar en implementar.)*
- **Afegir manualment**: enganxar URL o @usuari → detecció automàtica del tipus → previsualització → categoria/local per defecte → freqüència.
- **Descobriment automàtic** (sempre requereix **aprovació manual**, safata "Fonts proposades"):
  1. Per rastre: organitzadors que apareixen sovint als agregadors.
  2. Per cerca amb Gemini (*grounding* a Google) per zona i categoria.
  3. Per reenviament: un post d'un perfil no seguit → "Vols seguir-lo?".
- **Qualitat de la font**: rendiment (⭐/✅), soroll (descartats/fora de zona), exclusivitat, salut (errors, última execució correcta).
- **Safata d'entrada universal**: reenviar qualsevol missatge/cartell/enllaç al bot de Telegram o *Compartir → Event Selector* a Android → processament immediat.

## 5. Pipeline d'extracció

```
1 Planificador → 2 Fetch → 3 Hash → 4 Parsers en cascada → 5 Neteja → 6 Gemini
            → 7 Validació → 8 Normalització → 9 Fusió + detecció de canvis
```

1. **Planificador**: fonts actives amb `next_run_at <= ara`, fora de *backoff*.
2. **Fetch**: respecta `robots.txt`, ≥ 2 s entre peticions al mateix domini, `ETag`/`If-Modified-Since`, Playwright només si `needs_js`.
3. **Hash** del contingut: si no ha canviat, s'atura (principal estalvi de quota).
4. **Parsers en cascada**: adaptadors d'API → ICS → JSON-LD/Microdata `schema.org/Event` → Gemini.
5. **Neteja**: `trafilatura` → markdown (−80–90 % tokens). Prefiltre de regex per a posts d'Instagram.
6. **Gemini** amb esquema estricte (`ExtractionResult { events: ExtractedEvent[] }`): títol, inici/fi (Europe/Madrid), lloc, preu, URL i termini d'inscripció, categoria, etiquetes, notes d'accessibilitat, resum en català, `is_event`, `confidence`. El prompt inclou la data d'avui i les dades per defecte de la font.
7. **Validació**: dates coherents (no passades, < 18 mesos, fi ≥ inici). `confidence < 0.6` o sense lloc → **safata "Per revisar"** (no surt al feed fins que es valida).
8. **Normalització**: local (àlies + trigram → Nominatim + accessibilitat OSM), preu, categoria.
9. **Fusió**: deduplicació + registre de canvis a `event_changes`; si desapareix d'una font completa → "possiblement cancel·lat".

**Quota de Gemini**: taula `llm_usage`, cua amb prioritats (reenviaments manuals > fonts bones > fonts noves > descobriment), *backoff* exponencial amb 429, text → Groq si s'esgota, imatges esperen l'endemà.

**Errors**: reintents a 1 h / 6 h / 24 h, vermell al 3r error seguit, snapshot de la pàgina amb botó "Re-processar", prompts versionats (`extractor_version`), tests *golden* (20–30 pàgines/cartells reals).

## 6. Model de dades (resum)

```
sources         fonts i configuració (tipus, URL, freqüència, defectes, salut, estat: activa/proposada/rebutjada)
scrape_runs     execucions per font
raw_items       contingut brut + content_hash
venues          locals (geo, àlies, accessibilitat)
events          esdeveniments canònics (fingerprint, estat, extractor_version, camps bloquejats per correccions)
event_sources   N fonts per esdeveniment
event_changes   historial de canvis (per avisar dels plans ✅)
user_events     estat personal: interested | going | dismissed (+ motiu) + nota
user_zones      zones (centre, radi, activa)
user_prefs      pesos d'interès, disponibilitat, preferències
llm_usage       control de quota diària
```

## 7. Algorismes

### Rànquing (explicable, sense ML)
```
puntuació = 100 × (0.35·interès + 0.25·proximitat + 0.20·horari + 0.10·font + 0.10·novetat)
```
- Filtres durs: fora de zones actives, passats, descartats, etiquetes bloquejades.
- Aprenentatge: ⭐ +0.1, ✅ +0.2, ✕ segons el motiu:

| Motiu de descart | Efecte |
|---|---|
| No m'interessa el tema | −pes d'etiquetes/categoria |
| Massa lluny | redueix el radi efectiu |
| Mal horari | −pes de la franja |
| Massa car | +penalització per preu |
| No és un esdeveniment / dades errònies | +soroll de la font, registre d'error d'extracció |

- Panell **"Per què et surt?"** amb el desglossament de la puntuació.

### Deduplicació
Bloqueig (mateix dia, < 2 km) → puntuació (trigram del títol + diferència horària + distància + mateix local). ≥ 0.8 fusió automàtica, 0.6–0.8 "Possibles duplicats". La fusió agafa el millor camp de cada font.

### Recurrents
Cada sessió és un esdeveniment independent; la fitxa enllaça "Altres sessions del cicle".

## 8. Interfície

### Estil
Minimal + **miniatures** (cartell real; si no n'hi ha, quadrat amb la icona de la categoria). Categories amb **icona + color**:

| Categoria | Icona | Color |
|---|---|---|
| Cultura | màscares de teatre | lila |
| Esport/natura | excursionista | verd aigua |
| Formació/tech | bombeta | blau |
| Gastronomia/social | copa | coral |

Clar/fosc automàtic. Els plans (✅/⭐) amb fons sòlid; els suggeriments amb la puntuació a la dreta.

### Mòbil — pantalla inicial: Calendari
- **Tira de dies de la setmana fixa a dalt**, amb punts de densitat (suggeriments amb puntuació ≥ 85).
- A sota, una **llista desplaçable només del dia seleccionat**, amb **tots** els esdeveniments del dia:
  1. Els teus plans (✅ Hi vaig / ⭐ M'interessa).
  2. Suggeriments, **ordenats per puntuació**.
- **Gest lateral**: lliscar a l'esquerra/dreta sobre la llista canvia al dia següent/anterior.
- Gestos a la targeta: dreta → ⭐, esquerra → ✕ (amb motiu opcional).
- Navegació inferior: Calendari · Feed (cerca i filtres) · Mapa · Els meus plans · Configuració.

### Ordinador
**Mirall del mòbil** (maqueta validada: https://claude.ai/artifact/G2J29XQJk4vS4Mw8zrCi7z):
- **Capçalera**: marca, botons de zona (Igualada · 30 km / Barcelona · 15 km), cerca (`/`).
- **Tira de setmana**: 7 dies amb plans (✅/⭐), punts de densitat i nombre d'esdeveniments; fletxes per canviar de setmana.
- **Columna central**: llista del dia seleccionat (tots els esdeveniments; plans primer, suggeriments per puntuació). Arrossegar lateralment canvia de dia.
- **Panell de detall fix a la dreta**: la fitxa completa; clicar a la llista en canvia el contingut.
- **Dreceres de teclat**: `←` `→` dia · `↑` `↓` llista · `S` m'interessa · `A` hi vaig · `X` descartar (+ `1`–`5` motiu) · `G` Google Calendar · `/` cercar · `Esc` tancar.
- **Pantalla estreta (< 900 px)**: una sola columna; la fitxa substitueix la llista amb botó "Tornar".

### Fitxa de l'esdeveniment
Cartell · categoria i puntuació (ⓘ desglossament) · data/hora · lloc + km + Maps · preu · termini d'inscripció · **accessibilitat** · temps (aire lliure) · accions ⭐ / ✅ / Google Calendar / Entrades / Compartir / ✕ · resum Gemini + descripció original · altres sessions del cicle · a prop aquell dia · nota personal · fonts · corregir dades (les correccions no es sobreescriuen).

### Avisos
- **Canvis en plans ✅**: només a l'app (distintiu ⚠ amb el detall).
- **Terminis d'inscripció**: visibles a la fitxa, sense recordatoris.
- **Resum setmanal**: dijous a les 18 h pel bot de Telegram, top 10 del cap de setmana amb botons ⭐/✅/✕.

## 9. Google Calendar
1. **Enllaç directe** (`calendar.google.com/calendar/render?action=TEMPLATE&...`) — sense OAuth.
2. **Feed ICS personal** dels plans ✅ (subscripció a Google Calendar).
3. *(Opcional futur)* sincronització amb OAuth.

## 10. Pla de construcció

### Pas 0 — Preparació (usuari)
Supabase (projecte nou) · clau Gemini (AI Studio) · repositori GitHub públic + Vercel · bot de Telegram (@BotFather) · `api_id`/`api_hash` (my.telegram.org) · filtre Gmail + contrasenya d'aplicació · compte secundari d'Instagram.

### Fase 1 — MVP navegable
1. Esquelet Next.js + PWA + paquet `pipeline/`.
2. Esquema de BD (migració SQL).
3. Adaptadors Generalitat + Open Data BCN.
4. Extractor Gemini + validació + normalització + deduplicació + tests *golden*.
5. UI: calendari (mòbil i ordinador), fitxa, ⭐/✅/✕, Google Calendar.
6. Cron GitHub Actions + desplegament a Vercel.

**Fet quan**: al mòbil es veu la setmana amb esdeveniments reals d'Igualada i BCN i se'n pot afegir un a Google Calendar.

### Fase 2 — Entrada manual
Bot de Telegram · Web Share Target · gestor de fonts (afegir, salut, "Per revisar").

### Fase 3 — Fonts socials
Telethon · Gmail IMAP · Instaloader al PC · descobriment de fonts.

### Fase 4 — Intel·ligència i comoditat
Rànquing que aprèn · resum dels dijous · feed ICS · mapa · temps.

## 11. Riscos

| Risc | Mitigació |
|---|---|
| Bloqueig del compte secundari d'Instagram | Freqüència baixa, IP domèstica; alternativa: reenviament al bot |
| Webs que canvien d'estructura | Cascada amb Gemini com a últim recurs + panell de salut |
| Quota gratuïta de Gemini | Hash, cua amb prioritats, Groq com a alternativa |
| Supabase Free es pausa per inactivitat | El cron cada 6 h la manté activa |
| Condicions d'ús de xarxes socials | Ús estrictament personal, mai amb el compte principal |
