export const SITE_CONFIG = Object.freeze({
  siteUrl: "",
  supabaseUrl: "",
  supabasePublishableKey: "",
});

export function isBackendConfigured() {
  return Boolean(
    SITE_CONFIG.supabaseUrl.startsWith("https://") &&
      SITE_CONFIG.supabasePublishableKey.startsWith("sb_publishable_"),
  );
}
