"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { getPipelineStatus, type PipelineRun, type PipelineStatus, runPipeline } from "./pipeline-actions";

const POLL_MS = 15_000;
const MAX_POLL_MS = 70 * 60_000; // el workflow té un límit de 60 minuts
// Un run creat abans d'aquest marge respecte al clic és l'anterior: el nou encara no surt a l'API.
const DISPATCH_SKEW_MS = 60_000;

const time = (iso: string) =>
  new Date(iso).toLocaleString("ca", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });

const isActive = (run: PipelineRun | null) => run?.state === "queued" || run?.state === "running";

function describe(run: PipelineRun | null, starting: boolean): string {
  if (starting || run?.state === "queued") return "Engegant l'actualització…";
  if (!run) return "Encara no s'ha fet cap actualització.";
  if (run.state === "running") return `Llegint les fonts des de les ${time(run.createdAt)}. Triga uns minuts.`;
  if (run.state === "success") return `Darrera actualització: ${time(run.updatedAt)}.`;
  return `La darrera actualització ha fallat (${time(run.updatedAt)}).`;
}

export function PipelineButton() {
  const router = useRouter();
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [dispatchedAt, setDispatchedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pollStart = useRef<number>(0);

  const run = status?.configured ? status.run : null;
  // Després del clic, mentre GitHub no mostri el run nou, el que veiem és l'anterior.
  const runIsNew = run !== null && dispatchedAt !== null && Date.parse(run.createdAt) >= dispatchedAt - DISPATCH_SKEW_MS;
  const starting = dispatchedAt !== null && !runIsNew;
  const busy = starting || isActive(run);

  const refresh = useCallback(async () => {
    const next = await getPipelineStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPipelineStatus()
      .then((next) => { if (!cancelled) setStatus(next); })
      .catch(() => { if (!cancelled) setError("No s'ha pogut consultar l'estat de l'actualització."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!busy) return;
    if (!pollStart.current) pollStart.current = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - pollStart.current > MAX_POLL_MS) return clearInterval(timer);
      const next = await refresh().catch(() => null);
      const latest = next?.configured ? next.run : null;
      const finished = latest && !isActive(latest)
        && (dispatchedAt === null || Date.parse(latest.createdAt) >= dispatchedAt - DISPATCH_SKEW_MS);
      if (finished) {
        clearInterval(timer);
        pollStart.current = 0;
        setDispatchedAt(null);
        router.refresh(); // estat de les fonts i esdeveniments nous
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [busy, dispatchedAt, refresh, router]);

  const onClick = () =>
    start(async () => {
      setError(null);
      const message = await runPipeline();
      if (message) return setError(message);
      pollStart.current = Date.now();
      setDispatchedAt(Date.now());
    });

  if (status && !status.configured) {
    return (
      <p className="text-xs text-fg-3">
        Per actualitzar des d&apos;aquí cal posar GITHUB_DISPATCH_TOKEN a la configuració del servidor (vegeu el README).
        Mentrestant, l&apos;actualització es fa sola cada dia.
      </p>
    );
  }

  const shownError = error ?? (status?.configured ? status.error : undefined);
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-bg p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClick} disabled={!status || busy || pending}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-surface disabled:opacity-60">
          <RefreshCw size={16} className={busy || pending ? "animate-spin" : ""} />
          {busy ? "Actualitzant…" : "Actualitzar ara"}
        </button>
        <p className="min-w-0 flex-1 text-sm text-fg-2" aria-live="polite">
          {status ? describe(run, starting) : "Consultant l'estat…"}
          {run && !starting && (
            <> <a href={run.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-accent">Detalls</a></>
          )}
        </p>
      </div>
      <p className="text-xs text-fg-3">Llegeix totes les fonts ara, encara que no els toqui. Gasta quota de Gemini.</p>
      {shownError && <p className="text-sm text-gastro">{shownError}</p>}
    </div>
  );
}
