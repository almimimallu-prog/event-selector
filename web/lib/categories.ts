import { Drama, Lightbulb, Mountain, Wine, type LucideIcon } from "lucide-react";
import type { Category } from "./types";

export const CATEGORIES: Record<Category, { label: string; icon: LucideIcon; text: string; soft: string; bar: string }> = {
  cultura: { label: "Cultura", icon: Drama, text: "text-cultura", soft: "bg-cultura-soft", bar: "border-l-cultura" },
  esport_natura: { label: "Esport/natura", icon: Mountain, text: "text-esport", soft: "bg-esport-soft", bar: "border-l-esport" },
  formacio_tech: { label: "Formació/tech", icon: Lightbulb, text: "text-formacio", soft: "bg-formacio-soft", bar: "border-l-formacio" },
  gastronomia_social: { label: "Gastronomia/social", icon: Wine, text: "text-gastro", soft: "bg-gastro-soft", bar: "border-l-gastro" },
};

export const DISMISS_REASONS = [
  { key: "topic", label: "No m'interessa el tema" },
  { key: "too_far", label: "Massa lluny" },
  { key: "bad_time", label: "Mal horari" },
  { key: "too_expensive", label: "Massa car" },
  { key: "bad_data", label: "Dades errònies" },
] as const;
