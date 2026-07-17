import { INITIAL_BIRDS, PERIOD_OPTIONS, WEATHER_OPTIONS } from "./data/birds.js?v=20260716.11";
import {
  getCurrentAuthState,
  signInWithDiscord,
  subscribeAuthState,
} from "./auth.js";
import { getSupabaseClient, mapDatabaseBird } from "./backend.js";
import { isBackendConfigured } from "./site-config.js";

const AUTO_SAVE_DELAY = 750;

const elements = {
  accessButton: document.querySelector("#adminAccessButton"),
  dialog: document.querySelector("#adminDialog"),
  configPanel: document.querySelector("#adminConfigPanel"),
  discordGate: document.querySelector("#adminDiscordGate"),
  discordLoginButton: document.querySelector("#adminDiscordLoginButton"),
  discordStatus: document.querySelector("#adminDiscordStatus"),
  mfaForm: document.querySelector("#adminMfaForm"),
  mfaStatus: document.querySelector("#adminMfaStatus"),
  mfaInstructions: document.querySelector("#adminMfaInstructions"),
  mfaEnrollment: document.querySelector("#adminMfaEnrollment"),
  mfaQr: document.querySelector("#adminMfaQr"),
  mfaSecret: document.querySelector("#adminMfaSecret"),
  mfaCode: document.querySelector("#adminMfaCode"),
  editor: document.querySelector("#adminEditor"),
  birdSelect: document.querySelector("#adminBirdSelect"),
  birdForm: document.querySelector("#adminBirdForm"),
  saveStatus: document.querySelector("#adminSaveStatus"),
  importButton: document.querySelector("#adminImportButton"),
  logoutButton: document.querySelector("#adminLogoutButton"),
  weatherChecks: document.querySelector("#adminWeatherChecks"),
  periodChecks: document.querySelector("#adminPeriodChecks"),
};

const adminState = {
  client: null,
  mfa: null,
  auth: getCurrentAuthState(),
  birds: [],
  activeSlug: null,
  activeVersion: 1,
  hydrationId: 0,
  hydrating: false,
  dirty: false,
  saveTimer: null,
  realtimeChannel: null,
};

function setVisiblePanel(panel) {
  [elements.configPanel, elements.discordGate, elements.mfaForm, elements.editor].forEach((item) => {
    item.hidden = item !== panel;
  });
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function setSaveStatus(message, mode = "idle") {
  elements.saveStatus.textContent = message;
  elements.saveStatus.classList.toggle("is-saving", mode === "saving");
  elements.saveStatus.classList.toggle("is-error", mode === "error");
}

async function openAdmin() {
  if (!elements.dialog.open) elements.dialog.showModal();

  if (!isBackendConfigured()) {
    setVisiblePanel(elements.configPanel);
    return;
  }

  if (!adminState.auth.user || !adminState.auth.isAdmin) {
    setVisiblePanel(elements.discordGate);
    setStatus(
      elements.discordStatus,
      adminState.auth.user
        ? "Ce compte Discord n’est pas autorisé."
        : "Connectez le compte Discord administrateur.",
      Boolean(adminState.auth.user),
    );
    return;
  }

  try {
    await continueWithMfa();
  } catch (error) {
    setVisiblePanel(elements.discordGate);
    setStatus(elements.discordStatus, humanizeAuthError(error), true);
  }
}

async function getClient() {
  if (!adminState.client) adminState.client = await getSupabaseClient();
  if (!adminState.client) throw new Error("Backend non configuré.");
  return adminState.client;
}

async function continueWithMfa() {
  const client = await getClient();
  const { data: assurance, error: assuranceError } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;

  if (assurance?.currentLevel === "aal2") {
    await authorizeAndOpenEditor();
    return;
  }

  const { data: factorsData, error: factorsError } = await client.auth.mfa.listFactors();
  if (factorsError) throw factorsError;
  const verifiedFactor = factorsData?.totp?.find((factor) => factor.status === "verified");

  elements.mfaCode.value = "";
  setStatus(elements.mfaStatus, "");
  setVisiblePanel(elements.mfaForm);

  if (verifiedFactor) {
    adminState.mfa = { factorId: verifiedFactor.id, enrolling: false };
    elements.mfaEnrollment.hidden = true;
    elements.mfaInstructions.textContent =
      "Saisissez le code à six chiffres de votre application d'authentification.";
  } else {
    const { data: enrollment, error: enrollmentError } = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Plumetopia Admin",
    });
    if (enrollmentError) throw enrollmentError;
    adminState.mfa = { factorId: enrollment.id, enrolling: true };
    elements.mfaEnrollment.hidden = false;
    elements.mfaQr.src = enrollment.totp.qr_code;
    elements.mfaSecret.textContent = enrollment.totp.secret;
    elements.mfaInstructions.textContent =
      "Scannez ce QR code dans votre application, puis saisissez le premier code généré.";
  }

  elements.mfaCode.focus();
}

async function handleMfa(event) {
  event.preventDefault();
  const code = elements.mfaCode.value.replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) {
    setStatus(elements.mfaStatus, "Le code doit contenir exactement six chiffres.", true);
    return;
  }

  setStatus(elements.mfaStatus, "Vérification…");
  try {
    const client = await getClient();
    const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
      factorId: adminState.mfa.factorId,
    });
    if (challengeError) throw challengeError;

    const { error: verifyError } = await client.auth.mfa.verify({
      factorId: adminState.mfa.factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) throw verifyError;
    await authorizeAndOpenEditor();
  } catch (error) {
    setStatus(elements.mfaStatus, humanizeAuthError(error), true);
  }
}

async function authorizeAndOpenEditor() {
  const client = await getClient();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) throw userError || new Error("Session invalide.");

  const { data: adminUser, error: adminError } = await client.rpc("is_plumetopia_admin");
  if (adminError) throw adminError;
  if (!adminUser) {
    throw new Error("Cet identifiant Discord n'est pas autorisé à administrer Plumetopia.");
  }

  await loadAdminBirds();
  setVisiblePanel(elements.editor);
  subscribeAdminRealtime();
}

async function loadAdminBirds(preferredSlug = null) {
  const client = await getClient();
  const { data, error } = await client
    .from("birds")
    .select("*")
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;

  adminState.birds = (data || []).map(mapDatabaseBird).filter(Boolean);
  elements.birdSelect.replaceChildren();

  if (adminState.birds.length === 0) {
    elements.birdSelect.append(new Option("Base vide — importez la base initiale", ""));
    elements.birdSelect.disabled = true;
    elements.birdForm.hidden = true;
    return;
  }

  elements.birdSelect.disabled = false;
  elements.birdForm.hidden = false;
  adminState.birds.forEach((bird) => {
    elements.birdSelect.append(new Option(`${bird.name} · niveau ${bird.unlockLevel}`, bird.slug));
  });

  const slug = adminState.birds.some((bird) => bird.slug === preferredSlug)
    ? preferredSlug
    : adminState.activeSlug && adminState.birds.some((bird) => bird.slug === adminState.activeSlug)
      ? adminState.activeSlug
      : adminState.birds[0].slug;
  elements.birdSelect.value = slug;
  await hydrateEditor(slug);
}

async function loadCoordinates(slug) {
  const client = await getClient();
  const { data, error } = await client
    .from("bird_coordinates")
    .select("coordinates")
    .eq("bird_slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data?.coordinates ?? null;
}

async function hydrateEditor(slug) {
  const bird = adminState.birds.find((item) => item.slug === slug);
  if (!bird) return;

  const hydrationId = ++adminState.hydrationId;
  adminState.hydrating = true;
  elements.birdForm.inert = true;
  elements.birdForm.setAttribute("aria-busy", "true");

  let coordinates = null;
  let coordinatesError = null;
  try {
    coordinates = await loadCoordinates(bird.slug);
  } catch (error) {
    coordinatesError = error;
  }

  if (hydrationId !== adminState.hydrationId) return;

  adminState.activeSlug = bird.slug;
  adminState.activeVersion = bird.version || 1;

  const form = elements.birdForm.elements;
  form.namedItem("name").value = bird.name;
  form.namedItem("englishName").value = bird.englishName;
  form.namedItem("zones").value = bird.zones.join(", ");
  form.namedItem("unlockLevel").value = String(bird.unlockLevel);
  form.namedItem("category").value = bird.category;
  form.namedItem("details").value = bird.details;
  form.namedItem("image").value = bird.image.startsWith("https://") ? bird.image : "";
  form.namedItem("imageAlt").value = bird.imageAlt;
  form.namedItem("availabilityLabel").value = bird.availabilityLabel || bird.event || "";
  form.namedItem("isEvent").checked = bird.isEvent ?? Boolean(bird.event);
  form.namedItem("published").checked = bird.published !== false;

  setCheckedValues(elements.weatherChecks, bird.weather);
  setCheckedValues(elements.periodChecks, bird.periods);

  form.namedItem("coordinates").value = coordinates ? JSON.stringify(coordinates, null, 2) : "";
  if (coordinatesError) {
    setSaveStatus("Coordonnées indisponibles", "error");
  }

  adminState.dirty = false;
  if (!coordinatesError) setSaveStatus("À jour");
  adminState.hydrating = false;
  elements.birdForm.inert = false;
  elements.birdForm.removeAttribute("aria-busy");
}

function buildAdminChecks() {
  const build = (container, name, values) => {
    values.forEach((value) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = name;
      input.value = value;
      label.append(input, document.createTextNode(value));
      container.append(label);
    });
  };

  build(elements.weatherChecks, "weather", WEATHER_OPTIONS);
  build(elements.periodChecks, "periods", PERIOD_OPTIONS);
}

function setCheckedValues(container, selectedValues) {
  container.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.checked = selectedValues.includes(checkbox.value);
  });
}

function getCheckedValues(container) {
  return [...container.querySelectorAll("input[type='checkbox']:checked")].map(
    (checkbox) => checkbox.value,
  );
}

function scheduleSave() {
  if (adminState.hydrating || !adminState.activeSlug) return;
  adminState.dirty = true;
  clearTimeout(adminState.saveTimer);
  setSaveStatus("Modifications…", "saving");
  adminState.saveTimer = setTimeout(saveActiveBird, AUTO_SAVE_DELAY);
}

function collectDraft() {
  const form = elements.birdForm.elements;
  const originalBird = adminState.birds.find((bird) => bird.slug === adminState.activeSlug);
  const coordinatesText = form.namedItem("coordinates").value.trim();
  let coordinates = null;
  if (coordinatesText) {
    try {
      coordinates = JSON.parse(coordinatesText);
    } catch {
      throw new Error("Les coordonnées doivent être un JSON valide.");
    }
  }

  const draft = {
    name: form.namedItem("name").value.trim(),
    englishName: form.namedItem("englishName").value.trim(),
    zones: form
      .namedItem("zones")
      .value.split(",")
      .map((zone) => zone.trim())
      .filter(Boolean),
    unlockLevel: Number(form.namedItem("unlockLevel").value),
    category: form.namedItem("category").value.trim() || "Oiseau",
    details: form.namedItem("details").value.trim(),
    tip: originalBird?.tip || "",
    image:
      form.namedItem("image").value.trim() ||
      (originalBird?.image?.startsWith("./assets/") ? originalBird.image : ""),
    imageAlt: form.namedItem("imageAlt").value.trim(),
    sources: Array.isArray(originalBird?.sources) ? originalBird.sources : [],
    availabilityLabel: form.namedItem("availabilityLabel").value.trim(),
    weather: getCheckedValues(elements.weatherChecks),
    periods: getCheckedValues(elements.periodChecks),
    isEvent: form.namedItem("isEvent").checked,
    published: form.namedItem("published").checked,
    coordinates,
  };

  validateDraft(draft);
  return draft;
}

function validateDraft(draft) {
  if (draft.name.length < 2 || draft.name.length > 100) {
    throw new Error("Le nom français doit contenir entre 2 et 100 caractères.");
  }
  if (!draft.zones.length) throw new Error("Ajoutez au moins une zone.");
  if (!Number.isInteger(draft.unlockLevel) || draft.unlockLevel < 1 || draft.unlockLevel > 20) {
    throw new Error("Le niveau doit être un nombre entier compris entre 1 et 20.");
  }
  if (draft.details.length > 500 || (draft.details.length > 0 && draft.details.length < 12)) {
    throw new Error("Les détails doivent être vides ou contenir entre 12 et 500 caractères.");
  }
  if (!draft.weather.length) throw new Error("Sélectionnez au moins une météo.");
  if (!draft.periods.length) throw new Error("Sélectionnez au moins une période.");
  if (
    draft.image &&
    !draft.image.startsWith("https://") &&
    !draft.image.startsWith("./assets/")
  ) {
    throw new Error("La photo doit utiliser une URL HTTPS ou un asset local autorisé.");
  }
  if (draft.availabilityLabel.length > 120) {
    throw new Error("Le libellé de disponibilité ne doit pas dépasser 120 caractères.");
  }
  if (draft.coordinates !== null && !Array.isArray(draft.coordinates)) {
    throw new Error("Les coordonnées doivent être un tableau JSON.");
  }
}

async function saveActiveBird() {
  if (!adminState.dirty || !adminState.activeSlug) return true;

  let draft;
  try {
    draft = collectDraft();
  } catch (error) {
    setSaveStatus(error.message, "error");
    return false;
  }

  setSaveStatus("Enregistrement…", "saving");
  try {
    const client = await getClient();
    const update = {
      name: draft.name,
      english_name: draft.englishName,
      zones: draft.zones,
      weather: draft.weather,
      periods: draft.periods,
      unlock_level: draft.unlockLevel,
      category: draft.category,
      details: draft.details,
      tip: draft.tip,
      is_event: draft.isEvent,
      availability_label: draft.isEvent
        ? draft.availabilityLabel || "Événement ou saison"
        : null,
      image_url: draft.image || DEFAULT_IMAGE_FOR_DATABASE,
      image_alt: draft.imageAlt || `Portrait de ${draft.name}`,
      source_urls: draft.sources,
      published: draft.published,
      confidence: "administrateur",
      verified_at: new Date().toISOString().slice(0, 10),
    };

    const { data: updatedRow, error: updateError } = await client
      .rpc("save_bird_with_coordinates", {
        p_slug: adminState.activeSlug,
        p_expected_version: adminState.activeVersion,
        p_bird: update,
        p_coordinates: draft.coordinates,
      })
      .single();
    if (updateError) throw updateError;

    const mapped = mapDatabaseBird(updatedRow);
    adminState.activeVersion = mapped.version;
    const index = adminState.birds.findIndex((bird) => bird.slug === mapped.slug);
    if (index >= 0) adminState.birds.splice(index, 1, mapped);
    adminState.dirty = false;
    setSaveStatus(`Enregistré à ${new Intl.DateTimeFormat("fr", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date())}`);
    window.dispatchEvent(new CustomEvent("plumetopia:bird-updated", { detail: mapped }));
    return true;
  } catch (error) {
    const message = /version_conflict|serialization/i.test(String(error?.message || error))
      ? "Conflit : cette fiche a été modifiée ailleurs. Rechargez-la."
      : error.message || "Échec de l'enregistrement.";
    setSaveStatus(message, "error");
    return false;
  }
}

const DEFAULT_IMAGE_FOR_DATABASE = "./assets/birds/bird-placeholder.svg";

function normalizeInitialForDatabase(bird, index) {
  return {
    slug: bird.slug || bird.id,
    name: bird.name,
    english_name: bird.englishName || "",
    zones: bird.zones || [],
    weather: bird.weather || WEATHER_OPTIONS,
    periods: bird.periods || PERIOD_OPTIONS,
    unlock_level: Number(bird.unlockLevel) || 1,
    details: bird.details ?? "",
    tip:
      bird.tip ||
      `Explorez calmement ${(bird.zones && bird.zones[0]) || "la zone indiquée"} et gardez vos distances.`,
    category: bird.category || "Oiseau",
    is_event: Boolean(bird.event || bird.season),
    availability_label: bird.event || bird.season || null,
    image_url:
      bird.image?.startsWith("https://") || bird.image?.startsWith("./assets/")
        ? bird.image
        : DEFAULT_IMAGE_FOR_DATABASE,
    image_alt: bird.imageAlt || `Portrait de ${bird.name}`,
    source_urls: Array.isArray(bird.sources) ? bird.sources : [],
    confidence: bird.confidence || "communautaire",
    verified_at: bird.verifiedAt || "2026-07-13",
    published: true,
    position: index + 1,
  };
}

async function importInitialBirds() {
  if (!confirm("Importer ou mettre à jour toute la base initiale dans Supabase ?")) return;
  elements.importButton.disabled = true;
  elements.importButton.textContent = "Import en cours…";

  try {
    const client = await getClient();
    const rows = INITIAL_BIRDS.map(normalizeInitialForDatabase);
    for (let index = 0; index < rows.length; index += 25) {
      const { error } = await client
        .from("birds")
        .upsert(rows.slice(index, index + 25), { onConflict: "slug" });
      if (error) throw error;
    }
    await loadAdminBirds(adminState.activeSlug);
    elements.importButton.textContent = `${rows.length} fiches importées`;
  } catch (error) {
    elements.importButton.textContent = "Échec — réessayer";
    setSaveStatus(error.message || "Import impossible.", "error");
  } finally {
    elements.importButton.disabled = false;
  }
}

async function subscribeAdminRealtime() {
  const client = await getClient();
  if (adminState.realtimeChannel) await client.removeChannel(adminState.realtimeChannel);

  adminState.realtimeChannel = client
    .channel("plumetopia-admin-birds")
    .on("postgres_changes", { event: "*", schema: "public", table: "birds" }, async (payload) => {
      if (adminState.dirty) return;
      const changedSlug = payload.new?.slug || payload.old?.slug;
      await loadAdminBirds(changedSlug || adminState.activeSlug);
    })
    .subscribe();
}

async function closeAdmin() {
  clearTimeout(adminState.saveTimer);
  if (adminState.dirty) await saveActiveBird();
  const client = await getClient();
  if (adminState.realtimeChannel) {
    await client.removeChannel(adminState.realtimeChannel);
    adminState.realtimeChannel = null;
  }
  elements.dialog.close();
}

function humanizeAuthError(error) {
  const message = String(error?.message || error || "Erreur inconnue");
  if (/rate limit/i.test(message)) return "Trop de tentatives. Patientez avant de réessayer.";
  if (/expired|invalid.*code/i.test(message)) return "Code expiré ou incorrect.";
  return message;
}

function bindAdminEvents() {
  elements.accessButton.addEventListener("click", openAdmin);
  elements.discordLoginButton.addEventListener("click", async () => {
    setStatus(elements.discordStatus, "Ouverture de Discord…");
    try {
      await signInWithDiscord();
    } catch (error) {
      setStatus(elements.discordStatus, humanizeAuthError(error), true);
    }
  });
  elements.mfaForm.addEventListener("submit", handleMfa);
  elements.birdSelect.addEventListener("change", async (event) => {
    const requestedSlug = event.target.value;
    const previousSlug = adminState.activeSlug;
    clearTimeout(adminState.saveTimer);
    if (adminState.dirty) {
      const saved = await saveActiveBird();
      if (!saved) {
        event.target.value = previousSlug || "";
        return;
      }
    }
    await hydrateEditor(requestedSlug);
  });
  elements.birdForm.addEventListener("input", scheduleSave);
  elements.birdForm.addEventListener("change", scheduleSave);
  elements.importButton.addEventListener("click", importInitialBirds);
  elements.logoutButton.addEventListener("click", closeAdmin);
}

function initAdmin() {
  buildAdminChecks();
  bindAdminEvents();
  subscribeAuthState((authState) => {
    adminState.auth = authState;
    if (!authState.isAdmin && elements.editor.hidden === false && elements.dialog.open) {
      elements.dialog.close();
    }
  });
}

initAdmin();
