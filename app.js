import { INITIAL_BIRDS, PERIOD_OPTIONS, WEATHER_OPTIONS } from "./data/birds.js?v=20260719.1";
import { EVENT_CATALOGS, getEventCatalog } from "./data/events.js?v=20260716.5";
import {
  saveRemoteObservation,
  subscribeAuthState,
  synchronizeLocalObservations,
} from "./auth.js";
import { loadPublishedBirds, subscribeToPublishedBirds } from "./backend.js";
import { isBackendConfigured } from "./site-config.js";

const OBSERVED_STORAGE_KEY = "plumetopia.observed-birds.v1";
const OBSERVED_OWNER_KEY = "plumetopia.observed-owner.v1";
const DEFAULT_IMAGE = "./assets/birds/bird-placeholder.svg";
const PAGE_SIZE = 24;

const WEATHER_META = {
  Soleil: { icon: "☀️", className: "weather-sun", soft: "#fff0b8", border: "#d9a23b" },
  Pluie: { icon: "🌧️", className: "weather-rain", soft: "#e3f3f4", border: "#68a6b8" },
  "Arc-en-ciel": {
    icon: "🌈",
    className: "weather-rainbow",
    soft: "linear-gradient(90deg,#ffe3e2,#fff1bd,#e3f2d9,#e3f3f4,#eee6f3)",
    border: "#ca7189",
  },
};

const WEATHER_PRIORITY_OPTIONS = Object.freeze([
  {
    value: "all",
    icon: "🍃",
    label: "Tous les oiseaux",
    hint: "Sans priorité météo",
    className: "weather-tile-all",
  },
  {
    value: "sun",
    icon: "☀️",
    label: "Spécial soleil",
    hint: "Impossible sous la pluie",
    className: "weather-tile-sun",
  },
  {
    value: "rain",
    icon: "🌧️",
    label: "Spécial pluie",
    hint: "Impossible au soleil",
    className: "weather-tile-rain",
  },
  {
    value: "rainbow",
    icon: "🌈",
    label: "Exclusif arc-en-ciel",
    hint: "Uniquement sous l’arc-en-ciel",
    className: "weather-tile-rainbow",
  },
]);

const PERIOD_META = {
  Matin: "🌅",
  "Après-midi": "☀️",
  Soir: "🌇",
  Nuit: "🌙",
};

const COLLECTION_VIEW_OPTIONS = Object.freeze([
  { value: "all", icon: "🪶", label: "Tous" },
  { value: "observed", icon: "✓", label: "Observés" },
  { value: "missing", icon: "○", label: "Manquants" },
]);

const GAME_TIPS = Object.freeze([
  "La nuit, les oiseaux dorment : utilise ton sifflet pour les réveiller et déclencher leurs actions.",
  "Chaque jour, donne cinq cartes d’oiseaux à Bailey pour recevoir des récompenses.",
  "Pour obtenir une photo bien cadrée, centre l’oiseau, assure-toi qu’il n’y a pas d’obstacle et zoome jusqu’à afficher une distance de 4 m ou moins.",
  "Les oiseaux ont davantage de chances de déployer leurs ailes lorsqu’il pleut ou qu’un arc-en-ciel apparaît.",
]);

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

const state = {
  birds: normalizeBirds(INITIAL_BIRDS),
  query: "",
  catalogScope: "base",
  weatherPriority: "all",
  periods: new Set(),
  zone: "all",
  level: "all",
  collectionView: "all",
  sort: "level-desc",
  visibleCount: PAGE_SIZE,
  activeBirdId: null,
  observed: loadObservedBirds(),
  authenticatedUserId: null,
};

const elements = {
  siteHeader: document.querySelector(".site-header"),
  finder: document.querySelector(".finder"),
  searchInput: document.querySelector("#searchInput"),
  mobileFilterButton: document.querySelector("#mobileFilterButton"),
  mobileFilterCount: document.querySelector("#mobileFilterCount"),
  catalogTabs: document.querySelector("#catalogTabs"),
  filterDialog: document.querySelector("#filterDialog"),
  birdGrid: document.querySelector("#birdGrid"),
  emptyState: document.querySelector("#emptyState"),
  loadMoreButton: document.querySelector("#loadMoreButton"),
  catalogTitle: document.querySelector("#catalogTitle"),
  sortControl: document.querySelector("#sortControl"),
  sortSelect: document.querySelector("#sortSelect"),
  sortTrigger: document.querySelector("#sortSelectTrigger"),
  sortSelectedValue: document.querySelector("#sortSelectedValue"),
  sortMenu: document.querySelector("#sortOptions"),
  activeFilters: document.querySelector("#activeFilters"),
  observedHeaderCount: document.querySelector("#observedHeaderCount"),
  observedPercent: document.querySelector("#observedPercent"),
  observedProgressBar: document.querySelector("#observedProgressBar"),
  observedProgressText: document.querySelector("#observedProgressText"),
  birdTotal: document.querySelector("#birdTotal"),
  zoneTotal: document.querySelector("#zoneTotal"),
  birdDialog: document.querySelector("#birdDialog"),
  detailBirdImage: document.querySelector("#detailBirdImage"),
  detailObserveButton: document.querySelector("#detailObserveButton"),
  detailEnglishName: document.querySelector("#detailEnglishName"),
  detailBirdName: document.querySelector("#detailBirdName"),
  detailLevel: document.querySelector("#detailLevel"),
  detailDescription: document.querySelector("#detailDescription"),
  detailZones: document.querySelector("#detailZones"),
  detailWeather: document.querySelector("#detailWeather"),
  detailPeriods: document.querySelector("#detailPeriods"),
  detailAvailability: document.querySelector("#detailAvailability"),
  detailMapButton: document.querySelector("#detailMapButton"),
  gameTipText: document.querySelector("#gameTipText"),
  toast: document.querySelector("#toast"),
};

let toastTimer = null;
let searchFrame = null;
let unsubscribeRealtime = () => {};
let authSyncGeneration = 0;
let finderScrollFrame = null;
let activeSortIndex = 0;
let sortTypeaheadBuffer = "";
let sortTypeaheadTimer = null;

function renderRandomGameTip() {
  if (!elements.gameTipText || GAME_TIPS.length === 0) return;

  let previousIndex = -1;
  try {
    previousIndex = Number.parseInt(sessionStorage.getItem("plumetopia.last-tip"), 10);
  } catch {
    previousIndex = -1;
  }

  let nextIndex = Math.floor(Math.random() * GAME_TIPS.length);
  if (GAME_TIPS.length > 1 && nextIndex === previousIndex) {
    nextIndex = (nextIndex + 1 + Math.floor(Math.random() * (GAME_TIPS.length - 1))) % GAME_TIPS.length;
  }

  elements.gameTipText.textContent = GAME_TIPS[nextIndex];
  try {
    sessionStorage.setItem("plumetopia.last-tip", String(nextIndex));
  } catch {
    // L’astuce reste aléatoire si le stockage de session est indisponible.
  }
}

function normalizeBirds(input) {
  if (!Array.isArray(input)) return [];

  return input
    .map((bird, index) => {
      const id = String(bird.id || bird.slug || `oiseau-${index + 1}`);
      const sources = Array.isArray(bird.sources)
        ? bird.sources
        : bird.sourceUrl
          ? [bird.sourceUrl]
          : [];
      const zones = Array.isArray(bird.zones)
        ? bird.zones
        : bird.location
          ? [bird.location]
          : [];
      const periods = Array.isArray(bird.periods)
        ? bird.periods
        : Array.isArray(bird.time)
          ? bird.time
          : [];
      const eventLabel = bird.event || bird.season || (bird.isEvent ? "Événement" : null);
      const eventCatalog = getEventCatalog(eventLabel);
      const publicZones = eventLabel && !eventCatalog ? ["Événement Nid des Centaines"] : zones;

      return {
        id,
        slug: String(bird.slug || id),
        name: String(bird.name || "Oiseau à identifier"),
        englishName: String(bird.englishName || bird.originalName || ""),
        zones: publicZones.map(String).filter(Boolean),
        weather: (Array.isArray(bird.weather) ? bird.weather : []).map(canonicalWeather),
        periods: periods.map(canonicalPeriod),
        unlockLevel: Math.max(1, Number(bird.unlockLevel || bird.level) || 1),
        details: String(bird.details ?? bird.note ?? ""),
        tip: String(bird.tip || buildTip(zones)),
        category: String(bird.category || "Oiseau"),
        event: eventCatalog ? eventLabel : null,
        image: sanitizeImageUrl(bird.image),
        imageAlt: String(bird.imageAlt || `Portrait illustré de ${bird.name || "cet oiseau"}`),
        sources: sources.map(sanitizeExternalUrl).filter(Boolean),
        coordinates: bird.coordinates ?? null,
        verifiedAt: String(bird.verifiedAt || "2026-07-13"),
        confidence: String(bird.confidence || "à vérifier"),
        published: bird.published !== false,
        position: Number(bird.position) || index + 1,
        version: Number(bird.version) || 1,
      };
    })
    .filter((bird) => bird.published);
}

function canonicalWeather(value) {
  const normalized = normalizeText(value);
  if (normalized.includes("soleil") || normalized.includes("sun")) return "Soleil";
  if (normalized.includes("pluie") || normalized.includes("rain")) return "Pluie";
  if (normalized.includes("arc") || normalized.includes("rainbow")) return "Arc-en-ciel";
  return String(value);
}

function isAllWeather(weather) {
  return WEATHER_OPTIONS.every((option) => weather.includes(option));
}

function canonicalPeriod(value) {
  const normalized = normalizeText(value);
  if (normalized.includes("matin") || normalized.includes("dawn")) return "Matin";
  if (normalized.includes("apres") || normalized === "day" || normalized.includes("jour")) {
    return "Après-midi";
  }
  if (normalized.includes("soir") || normalized.includes("dusk")) return "Soir";
  if (normalized.includes("nuit") || normalized.includes("night")) return "Nuit";
  return String(value);
}

function buildTip(zones) {
  const primaryZone = zones[0] || "la zone indiquée";
  return `Parcourez calmement ${primaryZone} et écoutez les cris avant d'approcher avec le scanner.`;
}

function sanitizeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_IMAGE;
  const trimmed = value.trim();
  if (trimmed.startsWith("./") || trimmed.startsWith("/") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return DEFAULT_IMAGE;
}

function sanitizeExternalUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function loadObservedBirds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OBSERVED_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveObservedBirds() {
  try {
    localStorage.setItem(OBSERVED_STORAGE_KEY, JSON.stringify([...state.observed]));
  } catch {
    showToast("La progression ne peut pas être enregistrée dans ce navigateur.");
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 2600);
}

function createElement(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function matchesWeatherPriority(bird, priority = state.weatherPriority) {
  if (priority === "all") return true;

  const hasSun = bird.weather.includes("Soleil");
  const hasRain = bird.weather.includes("Pluie");
  const hasRainbow = bird.weather.includes("Arc-en-ciel");

  if (priority === "sun") return hasSun && !hasRain;
  if (priority === "rain") return hasRain && !hasSun;
  if (priority === "rainbow") return hasRainbow && !hasSun && !hasRain;
  return true;
}

function updateWeatherPriorityCounts() {
  document.querySelectorAll("[data-weather-priority-count]").forEach((element) => {
    const priority = element.dataset.weatherPriorityCount;
    const count = state.birds.filter((bird) => matchesWeatherPriority(bird, priority)).length;
    element.textContent = `${count} oiseau${count > 1 ? "x" : ""}`;
  });
}

function getBirdEventCatalog(bird) {
  return getEventCatalog(bird.event);
}

function getCatalogOptions() {
  const eventCounts = new Map();
  const fallbackCatalogs = new Map();
  let baseCount = 0;

  state.birds.forEach((bird) => {
    const catalog = getBirdEventCatalog(bird);
    if (!catalog) {
      baseCount += 1;
      return;
    }
    eventCounts.set(catalog.id, (eventCounts.get(catalog.id) || 0) + 1);
    if (!EVENT_CATALOGS.some((knownCatalog) => knownCatalog.id === catalog.id)) {
      fallbackCatalogs.set(catalog.id, catalog);
    }
  });

  const eventOptions = [
    ...EVENT_CATALOGS.filter((catalog) => eventCounts.has(catalog.id)),
    ...[...fallbackCatalogs.values()].sort((a, b) => collator.compare(a.label, b.label)),
  ].map((catalog) => ({ ...catalog, count: eventCounts.get(catalog.id) || 0 }));

  return [
    {
      id: "base",
      label: "Collection principale",
      icon: "🌿",
      className: "event-tab-base",
      count: baseCount,
    },
    ...eventOptions,
  ];
}

function selectCatalogScope(scope) {
  state.catalogScope = scope;
  resetVisibleCount();
  render();
}

function renderCatalogTabs() {
  const catalogs = getCatalogOptions();
  if (!catalogs.some((catalog) => catalog.id === state.catalogScope)) {
    state.catalogScope = "base";
  }

  const signature = catalogs.map((catalog) => `${catalog.id}:${catalog.count}`).join("|");
  if (elements.catalogTabs.dataset.signature !== signature) {
    elements.catalogTabs.replaceChildren();

    catalogs.forEach((catalog) => {
      const button = createElement(
        "button",
        `catalog-tab ${catalog.className || "event-tab-generic"}`,
      );
      button.type = "button";
      button.id = `catalog-tab-${catalog.id}`;
      button.setAttribute("role", "tab");
      button.dataset.catalogScope = catalog.id;
      button.setAttribute("aria-controls", "birdGrid");

      const copy = createElement("span", "catalog-tab-copy");
      copy.append(
        createElement("strong", "", catalog.label),
        createElement("small", "", `${catalog.count} oiseau${catalog.count > 1 ? "x" : ""}`),
      );
      button.append(createElement("span", "catalog-tab-icon", catalog.icon), copy);
      button.addEventListener("click", () => selectCatalogScope(catalog.id));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...elements.catalogTabs.querySelectorAll("[role='tab']")];
        const currentIndex = buttons.indexOf(button);
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const nextButton = buttons[(currentIndex + direction + buttons.length) % buttons.length];
        nextButton.focus();
        nextButton.click();
      });
      elements.catalogTabs.append(button);
    });

    elements.catalogTabs.dataset.signature = signature;
  }

  elements.catalogTabs.querySelectorAll("[role='tab']").forEach((button) => {
    const isSelected = button.dataset.catalogScope === state.catalogScope;
    button.setAttribute("aria-selected", String(isSelected));
    button.tabIndex = isSelected ? 0 : -1;
  });

  const activeCatalog = catalogs.find((catalog) => catalog.id === state.catalogScope) || catalogs[0];
  elements.catalogTitle.textContent = activeCatalog.label;
}

function renderFilterSurfaces() {
  document.querySelectorAll("[data-filter-surface]").forEach((surface) => {
    const weatherContainer = surface.querySelector(".js-weather-options");
    const periodContainer = surface.querySelector(".js-period-options");
    const zoneSelect = surface.querySelector(".js-zone-select");
    const levelSelect = surface.querySelector(".js-level-select");
    const collectionView = surface.querySelector(".js-collection-view");

    if (!weatherContainer.dataset.ready) {
      WEATHER_PRIORITY_OPTIONS.forEach((option) => {
        const button = createElement(
          "button",
          `filter-choice weather-priority-tile ${option.className}`,
        );
        button.type = "button";
        button.dataset.group = "weatherPriority";
        button.dataset.value = option.value;

        const copy = createElement("span", "filter-choice-copy");
        copy.append(
          createElement("strong", "", option.label),
          createElement("small", "", option.hint),
        );
        const count = createElement("small", "weather-priority-count");
        count.dataset.weatherPriorityCount = option.value;
        copy.append(count);
        button.append(createElement("span", "filter-choice-icon", option.icon), copy);
        button.addEventListener("click", () => {
          state.weatherPriority = option.value;
          resetVisibleCount();
          render();
        });
        weatherContainer.append(button);
      });
      weatherContainer.dataset.ready = "true";
    }

    if (!periodContainer.dataset.ready) {
      PERIOD_OPTIONS.forEach((period) => {
        const value = canonicalPeriod(period);
        const button = createElement("button", "filter-choice period-filter-tile");
        button.type = "button";
        button.dataset.group = "periods";
        button.dataset.value = value;
        const copy = createElement("span", "filter-choice-copy");
        copy.append(createElement("strong", "", value));
        button.append(createElement("span", "filter-choice-icon", PERIOD_META[value] || "◷"), copy);
        button.addEventListener("click", () => toggleSetFilter("periods", value));
        periodContainer.append(button);
      });
      periodContainer.dataset.ready = "true";
    }

    if (!zoneSelect.dataset.ready) {
      zoneSelect.addEventListener("change", (event) => {
        state.zone = event.currentTarget.value;
        resetVisibleCount();
        render();
      });
      zoneSelect.dataset.ready = "true";
    }

    if (!levelSelect.dataset.ready) {
      populateLevelSelect(levelSelect);
      levelSelect.addEventListener("change", (event) => {
        state.level = event.currentTarget.value;
        resetVisibleCount();
        render();
      });
      levelSelect.dataset.ready = "true";
    }

    if (!collectionView.dataset.ready) {
      COLLECTION_VIEW_OPTIONS.forEach((option) => {
        const button = createElement("button", "collection-view-button");
        button.type = "button";
        button.dataset.group = "collectionView";
        button.dataset.value = option.value;
        button.append(
          createElement("span", "collection-view-icon", option.icon),
          createElement("strong", "", option.label),
        );
        button.addEventListener("click", () => {
          state.collectionView = option.value;
          resetVisibleCount();
          render();
        });
        collectionView.append(button);
      });
      collectionView.dataset.ready = "true";
    }
  });

  populateZoneSelects();
  updateWeatherPriorityCounts();
  syncFilterControls();
}

function populateLevelSelect(select) {
  const selectedValue = state.level;
  select.replaceChildren(new Option("Tous les niveaux de passion", "all"));

  const maximumGroup = document.createElement("optgroup");
  maximumGroup.label = "Accessible jusqu’à mon niveau";
  const exactGroup = document.createElement("optgroup");
  exactGroup.label = "Un niveau précis";

  for (let level = 1; level <= 14; level += 1) {
    maximumGroup.append(new Option(`Jusqu’au niveau ${level}`, `max:${level}`));
    exactGroup.append(new Option(`Uniquement le niveau ${level}`, `exact:${level}`));
  }

  select.append(maximumGroup, exactGroup);
  select.value = selectedValue;
}

function populateZoneSelects() {
  const zones = [...new Set(state.birds.flatMap((bird) => bird.zones))].sort(collator.compare);
  document.querySelectorAll(".js-zone-select").forEach((select) => {
    const selectedValue = state.zone;
    select.replaceChildren(new Option("Toutes les zones", "all"));
    zones.forEach((zone) => select.append(new Option(zone, zone)));
    select.value = zones.includes(selectedValue) ? selectedValue : "all";
    if (select.value === "all" && state.zone !== "all") state.zone = "all";
  });
}

function toggleSetFilter(group, value) {
  const bucket = state[group];
  if (bucket.has(value)) bucket.delete(value);
  else bucket.add(value);
  resetVisibleCount();
  render();
}

function syncFilterControls() {
  document.querySelectorAll("[data-group='weatherPriority']").forEach((button) => {
    button.setAttribute("aria-pressed", String(state.weatherPriority === button.dataset.value));
  });
  document.querySelectorAll("[data-group='periods']").forEach((button) => {
    button.setAttribute("aria-pressed", String(state.periods.has(button.dataset.value)));
  });
  document.querySelectorAll(".js-zone-select").forEach((select) => {
    select.value = state.zone;
  });
  document.querySelectorAll(".js-level-select").forEach((select) => {
    select.value = state.level;
  });
  document.querySelectorAll("[data-group='collectionView']").forEach((button) => {
    button.setAttribute("aria-pressed", String(state.collectionView === button.dataset.value));
  });
}

function matchesLevel(level) {
  if (state.level === "all") return true;
  const [mode, rawValue] = state.level.split(":");
  const selectedLevel = Number(rawValue);
  if (!Number.isInteger(selectedLevel)) return true;
  if (mode === "exact") return level === selectedLevel;
  if (mode === "max") return level <= selectedLevel;
  return true;
}

function levelFilterLabel(value) {
  const [mode, rawLevel] = value.split(":");
  if (mode === "exact") return `Niveau ${rawLevel} uniquement`;
  if (mode === "max") return `Jusqu’au niveau ${rawLevel}`;
  return "Niveau de passion";
}

function matchesCatalogScope(bird, queryTerms) {
  const eventCatalog = getBirdEventCatalog(bird);

  if (state.catalogScope === "base") {
    if (!eventCatalog) return true;
    if (!queryTerms.length) return false;
    const birdNames = normalizeText(`${bird.name} ${bird.englishName}`);
    return queryTerms.every((term) => birdNames.includes(term));
  }

  return eventCatalog?.id === state.catalogScope;
}

function birdMatchesFilters(bird) {
  const searchText = normalizeText(
    [bird.name, bird.englishName, bird.details, bird.category, ...bird.zones].join(" "),
  );
  const terms = normalizeText(state.query).split(" ").filter(Boolean);
  const queryMatches = terms.every((term) => searchText.includes(term));
  const catalogMatches = matchesCatalogScope(bird, terms);
  const weatherMatches = matchesWeatherPriority(bird);
  const periodMatches =
    state.periods.size === 0 || [...state.periods].some((period) => bird.periods.includes(period));
  const selectedZoneIsParent =
    state.zone !== "all" && !state.zone.includes("—") && !state.zone.startsWith("Événement");
  const zoneMatches =
    state.zone === "all" ||
    bird.zones.some(
      (zone) => zone === state.zone || (selectedZoneIsParent && zone.startsWith(`${state.zone} —`)),
    );
  const isObserved = state.observed.has(bird.id);
  const collectionMatches =
    state.collectionView === "all" ||
    (state.collectionView === "observed" && isObserved) ||
    (state.collectionView === "missing" && !isObserved);

  return (
    queryMatches &&
    catalogMatches &&
    weatherMatches &&
    periodMatches &&
    zoneMatches &&
    matchesLevel(bird.unlockLevel) &&
    collectionMatches
  );
}

function getFilteredBirds() {
  const filtered = state.birds.filter(birdMatchesFilters);
  return filtered.sort((a, b) => {
    if (state.sort === "name") return collator.compare(a.name, b.name);
    if (state.sort === "zone") return collator.compare(a.zones[0] || "", b.zones[0] || "");
    if (state.sort === "level-desc") {
      return b.unlockLevel - a.unlockLevel || collator.compare(a.name, b.name);
    }
    return a.unlockLevel - b.unlockLevel || collator.compare(a.name, b.name);
  });
}

function configureBirdImage(image, source, media) {
  const isCutout = /\.png(?:$|[?#])/i.test(String(source || ""));
  image.classList.toggle("bird-image-cutout", isCutout);
  media?.classList.toggle("has-cutout-image", isCutout);
}

function createConditionPill(label, kind) {
  const meta = kind === "weather" ? WEATHER_META[label] : null;
  const icon = kind === "weather" ? meta?.icon || "•" : PERIOD_META[label] || "◷";
  const pill = createElement("span", `condition-pill ${meta?.className || ""}`.trim());
  pill.append(createElement("span", "", icon), document.createTextNode(label));
  return pill;
}

function createBirdCard(bird, visibleIndex = 0) {
  const card = createElement("article", "bird-card");
  card.dataset.birdId = bird.id;

  const media = createElement("div", "bird-card-media");
  const image = document.createElement("img");
  image.src = bird.image;
  configureBirdImage(image, bird.image, media);
  image.alt = bird.imageAlt;
  image.loading = visibleIndex < 3 ? "eager" : "lazy";
  if (visibleIndex === 0) image.fetchPriority = "high";
  image.decoding = "async";
  image.width = 800;
  image.height = 600;
  image.addEventListener(
    "error",
    () => {
      if (!image.src.endsWith("bird-placeholder.svg")) {
        image.src = DEFAULT_IMAGE;
        configureBirdImage(image, DEFAULT_IMAGE, media);
      }
    },
    { once: true },
  );

  media.append(image);
  const eventCatalog = getBirdEventCatalog(bird);
  let availabilityBadge = null;
  if (eventCatalog) {
    availabilityBadge = createElement(
      "span",
      "availability-badge",
      `${eventCatalog.icon} ${eventCatalog.label}`,
    );
    availabilityBadge.title = String(bird.event);
  }

  const observeButton = createElement("button", "observe-button");
  observeButton.type = "button";
  observeButton.setAttribute("aria-pressed", String(state.observed.has(bird.id)));
  observeButton.setAttribute(
    "aria-label",
    state.observed.has(bird.id)
      ? `Retirer ${bird.name} de mes observations`
      : `Marquer ${bird.name} comme observé`,
  );
  observeButton.textContent = state.observed.has(bird.id) ? "✓" : "○";
  observeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleObserved(bird.id);
  });
  const body = createElement("div", "bird-card-body");
  const nameLine = createElement("div", "bird-name-line");
  const names = createElement("div");
  names.append(createElement("h3", "", bird.name));
  if (bird.englishName) names.append(createElement("p", "bird-english", bird.englishName));
  nameLine.append(names, createElement("span", "level-badge", `Niv. ${bird.unlockLevel}`));

  const header = createElement("div", "bird-card-header");
  header.append(media, nameLine, observeButton);

  const location = createElement("p", "bird-location-line");
  location.append(createElement("span", "", "⌖"), document.createTextNode(bird.zones.join(" · ")));

  const conditionGroups = createElement("div", "bird-condition-groups");
  const weatherConditions = createElement("div", "condition-row condition-row-weather");
  weatherConditions.setAttribute("aria-label", "Météo");
  if (isAllWeather(bird.weather)) {
    const allWeatherPill = createElement("span", "condition-pill");
    const allWeatherIcon = createElement("span", "condition-pill-icon", "☀");
    allWeatherIcon.setAttribute("aria-hidden", "true");
    allWeatherPill.append(allWeatherIcon, document.createTextNode("Toute météo"));
    weatherConditions.append(allWeatherPill);
  } else {
    bird.weather.forEach((weather) =>
      weatherConditions.append(createConditionPill(weather, "weather")),
    );
  }

  const periodConditions = createElement("div", "condition-row condition-row-period");
  periodConditions.setAttribute("aria-label", "Période");
  if (bird.periods.length === PERIOD_OPTIONS.length) {
    periodConditions.append(createElement("span", "condition-pill", "◷ Toute la journée"));
  } else {
    bird.periods.forEach((period) => periodConditions.append(createConditionPill(period, "period")));
  }
  conditionGroups.append(weatherConditions, periodConditions);

  const details = bird.details.trim();
  const footer = createElement("div", "bird-card-footer");
  const viewLink = createElement("a", "view-bird-button", "Voir la fiche");
  viewLink.href = `./oiseaux/${encodeURIComponent(bird.slug || bird.id)}.html`;
  viewLink.append(createElement("span", "sr-only", ` de ${bird.name} dans Heartopia`));
  viewLink.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openBirdDialog(bird.id);
  });
  footer.append(viewLink);

  body.append(header);
  if (availabilityBadge) body.append(availabilityBadge);
  body.append(location, conditionGroups);
  if (details) body.append(createElement("p", "bird-details", details));
  body.append(footer);
  card.append(body);
  media.addEventListener("click", () => openBirdDialog(bird.id));
  return card;
}

function toggleObserved(birdId) {
  const bird = state.birds.find((item) => item.id === birdId);
  if (!bird) return;
  const willBeObserved = !state.observed.has(birdId);

  if (willBeObserved) {
    state.observed.add(birdId);
    showToast(`${bird.name} ajouté à votre carnet !`);
  } else {
    state.observed.delete(birdId);
    showToast(`${bird.name} retiré de votre carnet.`);
  }

  saveObservedBirds();
  render();
  if (state.activeBirdId === birdId && elements.birdDialog.open) updateDetailObserveButton(bird);

  if (state.authenticatedUserId) {
    saveRemoteObservation(birdId, willBeObserved).catch(() => {
      showToast("Modification gardée sur cet appareil ; la synchronisation reprendra plus tard.");
    });
  }
}

async function applyAuthState(authState) {
  if (!authState.ready) return;

  const generation = ++authSyncGeneration;
  const userId = authState.user?.id || null;

  if (!userId) {
    state.authenticatedUserId = null;
    render();
    return;
  }

  if (state.authenticatedUserId === userId) return;
  state.authenticatedUserId = userId;

  const storedOwner = localStorage.getItem(OBSERVED_OWNER_KEY);
  const localIds = storedOwner && storedOwner !== userId ? [] : [...state.observed];

  try {
    const mergedIds = await synchronizeLocalObservations(localIds);
    if (generation !== authSyncGeneration) return;
    state.observed = new Set(mergedIds);
    localStorage.setItem(OBSERVED_OWNER_KEY, userId);
    saveObservedBirds();
    render();
  } catch {
    if (generation !== authSyncGeneration) return;
    showToast("Connexion réussie, mais le carnet distant est momentanément indisponible.");
    render();
  }
}

function updateDetailObserveButton(bird) {
  const isObserved = state.observed.has(bird.id);
  elements.detailObserveButton.setAttribute("aria-pressed", String(isObserved));
  elements.detailObserveButton.setAttribute(
    "aria-label",
    isObserved ? `Retirer ${bird.name} de mes observations` : `Marquer ${bird.name} comme observé`,
  );
  elements.detailObserveButton.textContent = isObserved ? "✓" : "○";
}

function openBirdDialog(birdId) {
  const bird = state.birds.find((item) => item.id === birdId);
  if (!bird) return;

  state.activeBirdId = bird.id;
  elements.detailBirdImage.src = bird.image;
  configureBirdImage(elements.detailBirdImage, bird.image, elements.detailBirdImage.parentElement);
  elements.detailBirdImage.alt = bird.imageAlt;
  elements.detailBirdImage.onerror = () => {
    elements.detailBirdImage.onerror = null;
    elements.detailBirdImage.src = DEFAULT_IMAGE;
    configureBirdImage(elements.detailBirdImage, DEFAULT_IMAGE, elements.detailBirdImage.parentElement);
  };
  elements.detailEnglishName.textContent = bird.englishName;
  elements.detailEnglishName.hidden = !bird.englishName;
  elements.detailBirdName.textContent = bird.name;
  elements.detailLevel.textContent = `Niveau ${bird.unlockLevel}`;
  const details = bird.details.trim();
  elements.detailDescription.textContent = details;
  elements.detailDescription.hidden = !details;
  elements.detailZones.textContent = bird.zones.join(" · ");
  elements.detailWeather.textContent = isAllWeather(bird.weather)
    ? "Toute météo"
    : bird.weather
        .map((weather) => `${WEATHER_META[weather]?.icon || ""} ${weather}`)
        .join(" · ");
  elements.detailPeriods.textContent =
    bird.periods.length === PERIOD_OPTIONS.length
      ? "Toute la journée"
      : bird.periods.map((period) => `${PERIOD_META[period] || ""} ${period}`).join(" · ");
  elements.detailAvailability.textContent = bird.event ? String(bird.event) : "Permanent";
  elements.detailMapButton.dataset.birdId = bird.id;
  updateDetailObserveButton(bird);
  if (!elements.birdDialog.open) elements.birdDialog.showModal();
}

function renderActiveFilters() {
  const filters = [];
  if (state.query.trim()) filters.push({ label: `“${state.query.trim()}”`, clear: () => clearQuery() });
  if (state.weatherPriority !== "all") {
    const weatherOption = WEATHER_PRIORITY_OPTIONS.find(
      (option) => option.value === state.weatherPriority,
    );
    filters.push({
      label: `${weatherOption?.icon || ""} ${weatherOption?.label || "Priorité météo"}`,
      clear: () => setSimpleFilter("weatherPriority", "all"),
    });
  }
  state.periods.forEach((value) =>
    filters.push({ label: `${PERIOD_META[value] || ""} ${value}`, clear: () => toggleSetFilter("periods", value) }),
  );
  if (state.zone !== "all") filters.push({ label: state.zone, clear: () => setSimpleFilter("zone", "all") });
  if (state.level !== "all") filters.push({ label: levelFilterLabel(state.level), clear: () => setSimpleFilter("level", "all") });
  if (state.collectionView !== "all") {
    filters.push({
      label: state.collectionView === "observed" ? "Observés" : "Manquants",
      clear: () => setSimpleFilter("collectionView", "all"),
    });
  }

  elements.activeFilters.replaceChildren();
  filters.forEach(({ label, clear }) => {
    const button = createElement("button", "active-filter");
    button.type = "button";
    button.setAttribute("aria-label", `Retirer le filtre ${label}`);
    button.append(document.createTextNode(label), createElement("span", "", "×"));
    button.addEventListener("click", clear);
    elements.activeFilters.append(button);
  });

  const filterCount = filters.length - (state.query.trim() ? 1 : 0);
  elements.mobileFilterCount.hidden = filterCount === 0;
  elements.mobileFilterCount.textContent = String(filterCount);
}

function setSimpleFilter(key, value) {
  state[key] = value;
  resetVisibleCount();
  render();
}

function clearQuery() {
  state.query = "";
  elements.searchInput.value = "";
  resetVisibleCount();
  render();
}

function resetVisibleCount() {
  state.visibleCount = PAGE_SIZE;
}

function resetFilters() {
  state.query = "";
  state.catalogScope = "base";
  state.weatherPriority = "all";
  state.periods.clear();
  state.zone = "all";
  state.level = "all";
  state.collectionView = "all";
  elements.searchInput.value = "";
  resetVisibleCount();
  render();
}

function updateProgress() {
  const knownIds = new Set(state.birds.map((bird) => bird.id));
  const observedCount = [...state.observed].filter((id) => knownIds.has(id)).length;
  const total = state.birds.length;
  const percent = total ? Math.round((observedCount / total) * 100) : 0;
  elements.observedHeaderCount.textContent = `${observedCount} / ${total}`;
  elements.observedPercent.textContent = `${percent} %`;
  elements.observedProgressBar.style.width = `${percent}%`;
  elements.observedProgressText.textContent = observedCount
    ? `${observedCount} oiseau${observedCount > 1 ? "x" : ""} observé${observedCount > 1 ? "s" : ""} sur ${total}.`
    : "Aucun oiseau observé pour le moment.";
}

function render() {
  syncFilterControls();
  updateWeatherPriorityCounts();
  renderCatalogTabs();
  renderActiveFilters();
  updateProgress();

  const filtered = getFilteredBirds();
  const visible = filtered.slice(0, state.visibleCount);
  elements.birdGrid.replaceChildren(...visible.map((bird, index) => createBirdCard(bird, index)));
  elements.emptyState.hidden = filtered.length !== 0;
  elements.loadMoreButton.hidden = visible.length >= filtered.length;
  elements.birdTotal.textContent = String(state.birds.length);
  elements.zoneTotal.textContent = String(new Set(state.birds.flatMap((bird) => bird.zones)).size);
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function getSortOptions() {
  return [...(elements.sortMenu?.querySelectorAll("[role='option']") || [])];
}

function setActiveSortOption(index) {
  const options = getSortOptions();
  if (!options.length) return;

  activeSortIndex = (index + options.length) % options.length;
  options.forEach((option, optionIndex) => {
    option.classList.toggle("is-active", optionIndex === activeSortIndex);
  });
  elements.sortTrigger.setAttribute("aria-activedescendant", options[activeSortIndex].id);
  options[activeSortIndex].scrollIntoView({ block: "nearest" });
}

function setActiveSortOptionFromText(key) {
  const options = getSortOptions();
  const fragment = normalizeText(key);
  if (!options.length || !fragment) return false;

  clearTimeout(sortTypeaheadTimer);
  sortTypeaheadBuffer += fragment;

  const findMatch = (prefix, startIndex) => {
    for (let offset = 0; offset < options.length; offset += 1) {
      const index = (startIndex + offset) % options.length;
      if (normalizeText(options[index].textContent).startsWith(prefix)) return index;
    }
    return -1;
  };

  let matchIndex = findMatch(
    sortTypeaheadBuffer,
    sortTypeaheadBuffer === fragment ? activeSortIndex + 1 : 0,
  );
  if (matchIndex < 0 && sortTypeaheadBuffer !== fragment) {
    sortTypeaheadBuffer = fragment;
    matchIndex = findMatch(fragment, activeSortIndex + 1);
  }

  sortTypeaheadTimer = setTimeout(() => {
    sortTypeaheadBuffer = "";
  }, 700);

  if (matchIndex < 0) return false;
  if (elements.sortMenu.hidden) openSortPicker();
  setActiveSortOption(matchIndex);
  return true;
}

function syncSortPicker() {
  if (!elements.sortSelect || !elements.sortTrigger || !elements.sortMenu) return;

  const selectedValue = elements.sortSelect.value;
  const selectedNativeOption = elements.sortSelect.selectedOptions[0];
  const options = getSortOptions();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.dataset.value === selectedValue),
  );

  elements.sortSelectedValue.textContent = selectedNativeOption?.textContent || "Trier";
  options.forEach((option, index) => {
    option.setAttribute("aria-selected", String(index === selectedIndex));
  });
  activeSortIndex = selectedIndex;
}

function openSortPicker() {
  if (!elements.sortMenu?.hidden) return;

  syncSortPicker();
  elements.sortMenu.hidden = false;
  elements.sortControl.classList.add("is-open");
  elements.sortTrigger.setAttribute("aria-expanded", "true");
  setActiveSortOption(activeSortIndex);
}

function closeSortPicker({ restoreFocus = false } = {}) {
  if (!elements.sortMenu || elements.sortMenu.hidden) return;

  elements.sortMenu.hidden = true;
  elements.sortControl.classList.remove("is-open");
  elements.sortTrigger.setAttribute("aria-expanded", "false");
  elements.sortTrigger.removeAttribute("aria-activedescendant");
  getSortOptions().forEach((option) => option.classList.remove("is-active"));
  if (restoreFocus) elements.sortTrigger.focus();
}

function chooseSortOption(index) {
  const option = getSortOptions()[index];
  if (!option) return;

  const changed = elements.sortSelect.value !== option.dataset.value;
  elements.sortSelect.value = option.dataset.value;
  syncSortPicker();
  closeSortPicker({ restoreFocus: true });

  if (changed) {
    elements.sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function initializeSortPicker() {
  if (
    !elements.sortControl ||
    !elements.sortSelect ||
    !elements.sortTrigger ||
    !elements.sortSelectedValue ||
    !elements.sortMenu
  ) {
    return;
  }

  elements.sortControl.classList.add("is-enhanced");
  // Le select reste la source de vérité et le fallback sans JavaScript, mais
  // disparaît aussi de l'arbre d'accessibilité une fois la combobox activée.
  elements.sortSelect.hidden = true;
  elements.sortTrigger.hidden = false;
  syncSortPicker();

  elements.sortTrigger.addEventListener("click", () => {
    if (elements.sortMenu.hidden) openSortPicker();
    else closeSortPicker();
  });

  elements.sortTrigger.addEventListener("keydown", (event) => {
    const options = getSortOptions();
    if (!options.length) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (elements.sortMenu.hidden) openSortPicker();
      else setActiveSortOption(activeSortIndex + (event.key === "ArrowDown" ? 1 : -1));
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (elements.sortMenu.hidden) openSortPicker();
      setActiveSortOption(event.key === "Home" ? 0 : options.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (elements.sortMenu.hidden) openSortPicker();
      else chooseSortOption(activeSortIndex);
      return;
    }

    if (event.key === "Escape" && !elements.sortMenu.hidden) {
      event.preventDefault();
      closeSortPicker({ restoreFocus: true });
      return;
    }

    if (
      event.key.length === 1 &&
      event.key !== " " &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      setActiveSortOptionFromText(event.key)
    ) {
      event.preventDefault();
    }
  });

  elements.sortMenu.addEventListener("pointerdown", (event) => {
    // Les options utilisent aria-activedescendant et ne prennent pas le focus.
    // Garder le focus sur la combobox garantit que le click suit le pointerdown.
    event.preventDefault();
  });

  elements.sortMenu.addEventListener("pointermove", (event) => {
    const option = event.target.closest?.("[role='option']");
    const optionIndex = getSortOptions().indexOf(option);
    if (optionIndex >= 0 && optionIndex !== activeSortIndex) setActiveSortOption(optionIndex);
  });

  elements.sortMenu.addEventListener("click", (event) => {
    const option = event.target.closest?.("[role='option']");
    const optionIndex = getSortOptions().indexOf(option);
    if (optionIndex >= 0) chooseSortOption(optionIndex);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!elements.sortControl.contains(event.target)) closeSortPicker();
  });

  elements.sortTrigger.addEventListener("blur", (event) => {
    if (!elements.sortControl.contains(event.relatedTarget)) closeSortPicker();
  });
}

function bindStaticEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    cancelAnimationFrame(searchFrame);
    searchFrame = requestAnimationFrame(() => {
      state.query = event.target.value;
      resetVisibleCount();
      render();
    });
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (event.key === "/" && !isTyping && !document.querySelector("dialog[open]")) {
      event.preventDefault();
      elements.searchInput.focus();
    }
    if (event.key === "Escape" && elements.birdDialog.open) closeDialog(elements.birdDialog);
  });

  elements.mobileFilterButton.addEventListener("click", () => elements.filterDialog.showModal());
  elements.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    syncSortPicker();
    render();
  });
  elements.loadMoreButton.addEventListener("click", () => {
    state.visibleCount += PAGE_SIZE;
    render();
  });
  elements.detailObserveButton.addEventListener("click", () => {
    if (state.activeBirdId) toggleObserved(state.activeBirdId);
  });

  const updateFinderDockState = () => {
    cancelAnimationFrame(finderScrollFrame);
    finderScrollFrame = requestAnimationFrame(() => {
      const headerBottom = elements.siteHeader.getBoundingClientRect().bottom;
      const finderTop = elements.finder.getBoundingClientRect().top;
      const isDocked = window.scrollY > 0 && finderTop <= headerBottom + 1;
      elements.finder.classList.toggle("is-docked", isDocked);
      document.body.classList.toggle("finder-is-docked", isDocked);
    });
  };
  window.addEventListener("scroll", updateFinderDockState, { passive: true });
  window.addEventListener("resize", updateFinderDockState);
  updateFinderDockState();

  document.querySelectorAll(".js-reset-filters").forEach((button) => {
    button.addEventListener("click", resetFilters);
  });
  document.querySelectorAll(".js-close-dialog").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.closest("dialog")));
  });
  document.querySelectorAll(".js-apply-mobile-filters").forEach((button) => {
    button.addEventListener("click", () => closeDialog(elements.filterDialog));
  });
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });
}

function applyBirdUpdate(updatedBird) {
  const updatedId = String(updatedBird?.id || updatedBird?.slug || "");
  if (updatedBird?.published === false) {
    state.birds = state.birds.filter(
      (bird) => bird.id !== updatedId && bird.slug !== String(updatedBird?.slug || ""),
    );
    populateZoneSelects();
    render();
    return;
  }
  const normalized = normalizeBirds([updatedBird])[0];
  if (!normalized) return;
  const index = state.birds.findIndex((bird) => bird.id === normalized.id);
  if (index >= 0) state.birds.splice(index, 1, normalized);
  else state.birds.push(normalized);
  populateZoneSelects();
  render();
}

async function refreshFromBackend() {
  if (!isBackendConfigured()) return;
  try {
    const remoteBirds = await loadPublishedBirds();
    state.birds = normalizeBirds(remoteBirds);
    populateZoneSelects();
    render();
  } catch (error) {
    console.warn("Catalogue distant indisponible, base locale utilisée.", error);
  }
}

async function startRealtime() {
  if (!isBackendConfigured()) return;
  try {
    unsubscribeRealtime = await subscribeToPublishedBirds(refreshFromBackend);
  } catch (error) {
    console.warn("Synchronisation temps réel indisponible.", error);
  }
}

function init() {
  renderRandomGameTip();
  renderFilterSurfaces();
  initializeSortPicker();
  bindStaticEvents();
  render();

  const requestedBirdId = new URLSearchParams(window.location.search).get("oiseau");
  if (requestedBirdId && state.birds.some((bird) => bird.id === requestedBirdId)) {
    openBirdDialog(requestedBirdId);
  }

  subscribeAuthState(applyAuthState);

  window.addEventListener("plumetopia:bird-updated", (event) => {
    if (event.detail) applyBirdUpdate(event.detail);
  });
  window.addEventListener("plumetopia:notice", (event) => {
    if (event.detail) showToast(String(event.detail));
  });
  window.addEventListener("beforeunload", () => unsubscribeRealtime(), { once: true });

  refreshFromBackend();
  startRealtime();
}

init();
