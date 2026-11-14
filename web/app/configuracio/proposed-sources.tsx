"use client";

import { ExternalLink, Globe, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { addProposalWebsite, dismissProposal, followProposal } from "./sources-actions";

/** Compte d'Instagram que mencionen els comptes que segueixes (el troba el pipeline). */
export interface Proposal {
  id: string;
  name: string;
  handle: string;
  url: string | null;
  note: string | null;
  mentions: number;
  mentionedBy: string[];
  website: string | null;
  followers: number | null;
}

const VISIBLE = 5;
// Pàgines d'enllaços (Linktree i similars): no són el web de l'organitzador; cal obrir-les per trobar-lo.
// També escurçadors (bit.ly) i àlbums de fotos: tampoc no porten al programa.
const LINK_PAGE = /(^|\.)(linktr\.ee|linkin\.bio|beacons\.ai|lnk\.bio|bio\.link|taplink\.cc|campsite\.bio|linkr\.bio|solo\.to|allmylinks\.com|msha\.ke|later\.com|tap\.bio|snipfeed\.co|mtr\.bio|mtrbio\.com|bit\.ly|flic\.kr)$/i;

const input = "h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent";

function isLinkPage(url: string | null): boolean {
  try {
    return url ? LINK_PAGE.test(new URL(url).hostname) : false;
  } catch {
    return false;
  }
}

function ProposalRow({ proposal, onMessage }: { proposal: Proposal; onMessage: (m: { error: boolean; text: string } | null) => void }) {
  const [pending, start] = useTransition();
  const linkPage = isLinkPage(proposal.website);
  const [website, setWebsite] = useState(linkPage ? "" : proposal.website ?? "");
  const by = proposal.mentionedBy.map((h) => `@${h}`).join(", ");

  const run = (fn: () => Promise<string | null>) => start(async () => {
    const error = await fn();
    onMessage(error ? { error: true, text: error } : null);
  });
  const addWebsite = () => start(async () => {
    const result = await addProposalWebsite(proposal.id, website);
    onMessage({ error: result.status === "error", text: result.message ?? "" });
  });

  return (
    <li className={`flex flex-col gap-2 py-3 ${pending ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {proposal.name}
          {proposal.url && (
            <a href={proposal.url} target="_blank" rel="noopener noreferrer" aria-label={`Obrir @${proposal.handle} a Instagram`}
               className="ml-1.5 inline-block align-middle text-fg-3 hover:text-accent">
              <ExternalLink size={13} />
            </a>
          )}
        </p>
        <p className="text-xs text-fg-3">
          {proposal.mentions === 1 ? "1 menció" : `${proposal.mentions} mencions`} de {by}
          {proposal.followers ? ` · ${proposal.followers.toLocaleString("ca")} seguidors` : ""}
        </p>
        {proposal.note && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-fg-2">{proposal.note}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run(() => followProposal(proposal.id))}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-surface disabled:opacity-60">
          <Plus size={16} /> Seguir @{proposal.handle}
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => dismissProposal(proposal.id))}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-fg-2 hover:bg-surface-2 disabled:opacity-60">
          <X size={16} /> Descartar
        </button>
      </div>
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (website.trim()) addWebsite(); }}>
        <input value={website} onChange={(e) => setWebsite(e.target.value)} type="text" inputMode="url" autoCapitalize="none"
               placeholder="Web amb el programa (https://…)" aria-label={`Web de @${proposal.handle}`} className={input} />
        <button type="submit" disabled={pending || !website.trim()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-fg-2 hover:bg-surface-2 disabled:opacity-40">
          <Globe size={16} /> Afegir el web
        </button>
      </form>
      {linkPage && proposal.website && (
        <p className="text-xs text-fg-3">
          El perfil enllaça a una pàgina d&apos;enllaços:{" "}
          <a href={proposal.website} target="_blank" rel="noopener noreferrer" className="underline hover:text-accent">obre-la</a>
          {" "}per trobar-hi el web amb el programa i enganxa&apos;l a dalt.
        </p>
      )}
    </li>
  );
}

export function ProposedSources({ proposals }: { proposals: Proposal[] }) {
  const [showAll, setShowAll] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  if (proposals.length === 0) return null;
  const sorted = [...proposals].sort((a, b) => b.mentions - a.mentions || a.handle.localeCompare(b.handle));
  const shown = showAll ? sorted : sorted.slice(0, VISIBLE);

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-bg p-3">
      <p className="text-sm font-semibold">Fonts proposades ({proposals.length})</p>
      <p className="text-xs text-fg-3">
        Comptes que mencionen els comptes d&apos;Instagram que segueixes. Pots seguir el compte, afegir-ne el web
        (sovint hi ha el programa complet) o descartar-lo; els descartats no tornen a sortir.
      </p>
      <ul className="divide-y divide-line">
        {shown.map((p) => <ProposalRow key={p.id} proposal={p} onMessage={setMessage} />)}
      </ul>
      {sorted.length > VISIBLE && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="self-start text-sm text-accent underline">
          {showAll ? "Mostrar-ne menys" : `Veure-les totes (${sorted.length})`}
        </button>
      )}
      {message?.text && <p className={`text-sm ${message.error ? "text-gastro" : "text-going"}`}>{message.text}</p>}
    </div>
  );
}
