const normalizeEventText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const MAIN_COLLECTION_EVENTS = Object.freeze(["nid des centaines", "hundreds nest"]);

export const EVENT_CATALOGS = Object.freeze([
  Object.freeze({
    id: "appel-des-baleines",
    label: "Saison des baleines",
    icon: "🐋",
    className: "event-tab-whales",
    matchTokens: Object.freeze(["saison des baleines", "appel des baleines", "call of whales"]),
  }),
  Object.freeze({
    id: "saison-du-givre",
    label: "Saison des neiges",
    icon: "❄️",
    className: "event-tab-frost",
    matchTokens: Object.freeze(["saison des neiges", "saison du givre", "winter frost", "phase cachee"]),
  }),
  Object.freeze({
    id: "rues-modulaires",
    label: "Rues modulaires",
    icon: "🧱",
    className: "event-tab-streets",
    matchTokens: Object.freeze(["rues modulaires", "modular streets"]),
  }),
  Object.freeze({
    id: "cinematiques-oniriques",
    label: "Rêves Projetés",
    icon: "🎭",
    className: "event-tab-dream",
    matchTokens: Object.freeze(["reves projetes", "cinematiques oniriques", "dreamlight cinematics"]),
  }),
]);

function fallbackEventCatalog(eventLabel) {
  const label = String(eventLabel || "Événement")
    .split(/[—·]/, 1)[0]
    .trim();
  const id = normalizeEventText(label).replace(/\s+/g, "-") || "evenement";
  return {
    id: `evenement-${id}`,
    label,
    icon: "🎟️",
    className: "event-tab-generic",
    matchTokens: [],
  };
}

export function getEventCatalog(eventLabel) {
  if (!eventLabel) return null;
  const normalized = normalizeEventText(eventLabel);
  if (MAIN_COLLECTION_EVENTS.some((token) => normalized.includes(token))) return null;
  return (
    EVENT_CATALOGS.find((catalog) =>
      catalog.matchTokens.some((token) => normalized.includes(token)),
    ) || fallbackEventCatalog(eventLabel)
  );
}
