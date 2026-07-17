import { SITE_CONFIG, isBackendConfigured } from "./site-config.js";

const SUPABASE_ESM_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.5/+esm";
let clientPromise = null;

export async function getSupabaseClient() {
  if (!isBackendConfigured()) return null;

  if (!clientPromise) {
    clientPromise = import(SUPABASE_ESM_URL).then(({ createClient }) =>
      createClient(SITE_CONFIG.supabaseUrl, SITE_CONFIG.supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }),
    );
  }

  return clientPromise;
}

export function mapDatabaseBird(row) {
  if (!row || typeof row !== "object") return null;

  return {
    id: row.slug,
    slug: row.slug,
    name: row.name,
    englishName: row.english_name || "",
    zones: Array.isArray(row.zones) ? row.zones : [],
    weather: Array.isArray(row.weather) ? row.weather : [],
    periods: Array.isArray(row.periods) ? row.periods : [],
    unlockLevel: Number(row.unlock_level) || 1,
    details: row.details || "",
    tip: row.tip || "",
    category: row.category || "Oiseau",
    isEvent: Boolean(row.is_event),
    availabilityLabel: row.availability_label || "",
    event: row.is_event ? row.availability_label || "Événement" : null,
    image: row.image_url || "./assets/birds/bird-placeholder.svg",
    imageAlt: row.image_alt || `Portrait de ${row.name || "l'oiseau"}`,
    sources: Array.isArray(row.source_urls) ? row.source_urls : [],
    coordinates: null,
    verifiedAt: row.verified_at || row.updated_at || "",
    confidence: row.confidence || "communautaire",
    published: row.published !== false,
    position: Number(row.position) || 0,
    version: Number(row.version) || 1,
  };
}

export async function loadPublishedBirds() {
  const client = await getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from("birds")
    .select(
      "slug,name,english_name,zones,weather,periods,unlock_level,details,tip,category,is_event,availability_label,image_url,image_alt,source_urls,verified_at,confidence,published,position,version,updated_at",
    )
    .eq("published", true)
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data || []).map(mapDatabaseBird).filter(Boolean);
}

export async function subscribeToPublishedBirds(onRefresh) {
  const client = await getSupabaseClient();
  if (!client) return () => {};

  const channel = client
    .channel("plumetopia-public-birds")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "birds" },
      () => onRefresh(),
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
