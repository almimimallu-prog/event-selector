export type Category = "cultura" | "esport_natura" | "formacio_tech" | "gastronomia_social" | "dating";
export type Kind = "session" | "long_running" | "course";
export type UserState = "interested" | "going" | "dismissed";
export type DismissReason = "topic" | "too_far" | "bad_time" | "too_expensive" | "bad_data";

// Una fila de la funció SQL app_events.
export type AppEvent = {
  id: string;
  title: string;
  summary_ca: string | null;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  kind: Kind;
  schedule_text: string | null;
  category: Category;
  tags: string[];
  price_min: number | null;
  price_text: string | null;
  is_free: boolean | null;
  registration_url: string | null;
  registration_deadline: string | null;
  url: string | null;
  image_url: string | null;
  series_key: string | null;
  first_seen_at: string;
  status: "published" | "maybe_cancelled";
  city: string | null;
  lat: number | null;
  lon: number | null;
  venue_name: string | null;
  venue_wheelchair: "yes" | "limited" | "no" | "unknown" | null;
  user_state: UserState | null;
  dismiss_reason: DismissReason | null;
  note: string | null;
  sources: { name: string; url: string | null }[];
  zone_name: string | null;
  zone_km: number | null;
  has_unseen_changes: boolean;
};

export type Zone = { id: string; name: string; radius_km: number; active: boolean; lat?: number; lon?: number };

export type AvailabilitySlot = { days: number[]; from: string; to: string; weight: number };

type Counts = { pos: number; neg: number };

/** El que s'aprèn de les marques (funció SQL app_learning). */
export type Learning = {
  categories: Partial<Record<Category, Counts>>;
  tags: Record<string, Counts>;
  far_km: number | null;
  expensive_eur: number | null;
  bad_slots: Record<string, number>;
};

export const NO_LEARNING: Learning = { categories: {}, tags: {}, far_km: null, expensive_eur: null, bad_slots: {} };

export type Prefs = {
  category_weights: Partial<Record<Category, number>>;
  availability: AvailabilitySlot[];
  default_availability_weight: number;
  /** Paraules bloquejades: els plans que les contenen no surten mai (columna blocked_tags). */
  blocked_tags: string[];
  learning: Learning;
};
