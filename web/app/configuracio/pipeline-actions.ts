"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Botó «Actualitzar ara» de Configuració → Fonts: engega el workflow de GitHub Actions del pipeline
 * (workflow_dispatch, totes les fonts) i en llegeix l'estat de la darrera execució.
 *
 * Cal GITHUB_DISPATCH_TOKEN (token «fine-grained» de GitHub només d'aquest repositori, permís Actions: Read and write)
 * a les variables d'entorn de Vercel i a .env.local. Només al servidor.
 */

const REPO = process.env.GITHUB_REPO || "almimimallu-prog/event-selector";
const WORKFLOW = "pipeline.yml";
const TIMEOUT_MS = 10_000;

export type PipelineRun = {
  state: "queued" | "running" | "success" | "failure";
  createdAt: string;
  updatedAt: string;
  url: string;
};

export type PipelineStatus =
  | { configured: false }
  | { configured: true; run: PipelineRun | null; error?: string };

type GithubRun = { status: string; conclusion: string | null; created_at: string; updated_at: string; html_url: string };

function github(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

function toRun(run: GithubRun): PipelineRun {
  const state = run.status === "completed"
    ? (run.conclusion === "success" ? "success" : "failure")
    : run.status === "in_progress" ? "running" : "queued";
  return { state, createdAt: run.created_at, updatedAt: run.updated_at, url: run.html_url };
}

function githubError(status: number): string {
  if (status === 401) return "El token de GitHub no és vàlid o ha caducat (GITHUB_DISPATCH_TOKEN).";
  if (status === 403 || status === 404) return "El token de GitHub no té permís d'Actions sobre el repositori.";
  return `GitHub ha respost ${status}.`;
}

async function signedIn(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return Boolean(data);
}

async function latestRun(): Promise<{ run: PipelineRun | null; error?: string }> {
  const res = await github("/runs?per_page=1");
  if (!res.ok) return { run: null, error: githubError(res.status) };
  const body = (await res.json()) as { workflow_runs?: GithubRun[] };
  const run = body.workflow_runs?.[0];
  return { run: run ? toRun(run) : null };
}

export async function getPipelineStatus(): Promise<PipelineStatus> {
  if (!process.env.GITHUB_DISPATCH_TOKEN) return { configured: false };
  if (!(await signedIn())) return { configured: true, run: null, error: "La sessió ha caducat. Torna a entrar." };
  try {
    return { configured: true, ...(await latestRun()) };
  } catch {
    return { configured: true, run: null, error: "No s'ha pogut contactar amb GitHub." };
  }
}

/** Engega el pipeline amb totes les fonts. Retorna un missatge d'error o null si s'ha engegat. */
export async function runPipeline(): Promise<string | null> {
  if (!process.env.GITHUB_DISPATCH_TOKEN) return "Falta GITHUB_DISPATCH_TOKEN a la configuració del servidor.";
  if (!(await signedIn())) return "La sessió ha caducat. Torna a entrar.";
  try {
    const { run } = await latestRun();
    if (run && (run.state === "queued" || run.state === "running")) return "Ja hi ha una actualització en marxa.";
    const res = await github("/dispatches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { all: "true" } }),
    });
    return res.ok ? null : githubError(res.status);
  } catch {
    return "No s'ha pogut contactar amb GitHub.";
  }
}
