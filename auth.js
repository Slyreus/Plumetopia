import { getSupabaseClient } from "./backend.js";
import { SITE_CONFIG, isBackendConfigured } from "./site-config.js";

const listeners = new Set();

const elements = {
  loginShell: document.querySelector("#discordLoginShell"),
  loginButton: document.querySelector("#discordLoginButton"),
  loginTooltip: document.querySelector("#discordLoginTooltip"),
  account: document.querySelector("#discordAccount"),
  avatar: document.querySelector("#discordAvatar"),
  displayName: document.querySelector("#discordDisplayName"),
  syncStatus: document.querySelector("#discordSyncStatus"),
  logoutButton: document.querySelector("#discordLogoutButton"),
  adminButton: document.querySelector("#adminAccessButton"),
};

let client = null;
let refreshGeneration = 0;
let authState = Object.freeze({
  ready: false,
  configured: isBackendConfigured(),
  user: null,
  isAdmin: false,
  observedIds: [],
  syncError: false,
});

function emitNotice(message) {
  window.dispatchEvent(new CustomEvent("plumetopia:notice", { detail: message }));
}

function emitState() {
  renderAuthUi();
  listeners.forEach((listener) => listener(authState));
}

function replaceState(patch) {
  authState = Object.freeze({ ...authState, ...patch });
  emitState();
}

function safeAvatarUrl(user) {
  const value = String(user?.user_metadata?.avatar_url || "");
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "./assets/brand/plumetopia.svg";
  } catch {
    return "./assets/brand/plumetopia.svg";
  }
}

function getDisplayName(user) {
  const metadata = user?.user_metadata || {};
  return String(
    metadata.full_name ||
      metadata.global_name ||
      metadata.name ||
      metadata.preferred_username ||
      metadata.user_name ||
      "Membre Discord",
  );
}

function renderAuthUi() {
  const isAuthenticated = Boolean(authState.user);
  document.body.classList.toggle("is-authenticated", isAuthenticated);

  elements.loginButton.hidden = isAuthenticated;
  elements.account.hidden = !isAuthenticated;
  elements.adminButton.hidden = !authState.isAdmin;

  if (!authState.configured) {
    elements.loginButton.disabled = true;
    elements.loginButton.title =
      "Indisponible pour le moment — Discord servira bientôt à sauvegarder votre carnet";
    elements.loginShell?.classList.add("is-unavailable");
    elements.loginShell?.setAttribute("tabindex", "0");
    elements.loginTooltip?.removeAttribute("aria-hidden");
  } else {
    elements.loginButton.disabled = false;
    elements.loginButton.removeAttribute("title");
    elements.loginShell?.classList.remove("is-unavailable");
    elements.loginShell?.removeAttribute("tabindex");
    elements.loginTooltip?.setAttribute("aria-hidden", "true");
  }

  if (!isAuthenticated) return;
  elements.avatar.src = safeAvatarUrl(authState.user);
  elements.avatar.alt = `Avatar Discord de ${getDisplayName(authState.user)}`;
  elements.displayName.textContent = getDisplayName(authState.user);
  elements.syncStatus.textContent = authState.syncError
    ? "Synchronisation à reprendre"
    : "Carnet synchronisé";
}

async function getClient() {
  if (!client) client = await getSupabaseClient();
  if (!client) throw new Error("La connexion Discord n’est pas encore configurée.");
  return client;
}

async function loadObservations(activeClient) {
  const { data, error } = await activeClient
    .from("user_bird_observations")
    .select("bird_slug")
    .order("observed_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => String(row.bird_slug));
}

async function detectAdmin(activeClient) {
  const { data, error } = await activeClient.rpc("is_plumetopia_admin");
  if (error) throw error;
  return data === true;
}

async function refreshFromSession(session) {
  const generation = ++refreshGeneration;
  const user = session?.user || null;

  if (!user) {
    replaceState({ ready: true, user: null, isAdmin: false, observedIds: [], syncError: false });
    return;
  }

  const activeClient = await getClient();
  const [observationsResult, adminResult] = await Promise.allSettled([
    loadObservations(activeClient),
    detectAdmin(activeClient),
  ]);
  if (generation !== refreshGeneration) return;

  replaceState({
    ready: true,
    user,
    observedIds:
      observationsResult.status === "fulfilled" ? observationsResult.value : [],
    isAdmin: adminResult.status === "fulfilled" && adminResult.value,
    syncError: observationsResult.status === "rejected",
  });
}

function authRedirectUrl() {
  const base = SITE_CONFIG.siteUrl || window.location.origin;
  return new URL(window.location.pathname, base).href;
}

export async function signInWithDiscord() {
  if (!isBackendConfigured()) {
    throw new Error("Configurez d’abord Supabase et le fournisseur Discord.");
  }

  const activeClient = await getClient();
  const { error } = await activeClient.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}

export async function signOutPlumetopia() {
  const activeClient = await getClient();
  const { error } = await activeClient.auth.signOut();
  if (error) throw error;
}

export function subscribeAuthState(listener) {
  listeners.add(listener);
  listener(authState);
  return () => listeners.delete(listener);
}

export function getCurrentAuthState() {
  return authState;
}

export async function synchronizeLocalObservations(localIds) {
  if (!authState.user) return [...new Set(localIds.map(String))];

  const activeClient = await getClient();
  const remoteIds = new Set(authState.observedIds);
  const safeLocalIds = [...new Set(localIds.map(String).filter(Boolean))];
  const missingRows = safeLocalIds
    .filter((birdSlug) => !remoteIds.has(birdSlug))
    .map((birdSlug) => ({ user_id: authState.user.id, bird_slug: birdSlug }));

  if (missingRows.length) {
    const { error } = await activeClient
      .from("user_bird_observations")
      .upsert(missingRows, { onConflict: "user_id,bird_slug" });
    if (error) throw error;
  }

  const mergedIds = [...new Set([...remoteIds, ...safeLocalIds])];
  replaceState({ observedIds: mergedIds, syncError: false });
  return mergedIds;
}

export async function saveRemoteObservation(birdSlug, isObserved) {
  if (!authState.user) return;

  const activeClient = await getClient();
  let error = null;

  if (isObserved) {
    ({ error } = await activeClient.from("user_bird_observations").upsert(
      { user_id: authState.user.id, bird_slug: birdSlug },
      { onConflict: "user_id,bird_slug" },
    ));
  } else {
    ({ error } = await activeClient
      .from("user_bird_observations")
      .delete()
      .eq("user_id", authState.user.id)
      .eq("bird_slug", birdSlug));
  }

  if (error) {
    replaceState({ syncError: true });
    throw error;
  }

  const observedIds = new Set(authState.observedIds);
  if (isObserved) observedIds.add(birdSlug);
  else observedIds.delete(birdSlug);
  replaceState({ observedIds: [...observedIds], syncError: false });
}

async function initAuth() {
  elements.loginButton.addEventListener("click", () => {
    signInWithDiscord().catch((error) => emitNotice(error.message || "Connexion impossible."));
  });
  elements.logoutButton.addEventListener("click", () => {
    signOutPlumetopia().catch((error) => emitNotice(error.message || "Déconnexion impossible."));
  });

  renderAuthUi();
  if (!isBackendConfigured()) {
    replaceState({ ready: true });
    return;
  }

  try {
    const activeClient = await getClient();
    activeClient.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => refreshFromSession(session), 0);
    });
    const {
      data: { session },
      error,
    } = await activeClient.auth.getSession();
    if (error) throw error;
    await refreshFromSession(session);
  } catch (error) {
    console.warn("Initialisation Discord indisponible.", error);
    replaceState({ ready: true, syncError: true });
  }
}

initAuth();
