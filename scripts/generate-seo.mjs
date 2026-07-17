import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INITIAL_BIRDS, PERIOD_OPTIONS, WEATHER_OPTIONS } from "../data/birds.js";
import { SITE_CONFIG } from "../site-config.js";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const rootDirectory = path.resolve(scriptDirectory, "..");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function normalizeSiteUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function pageUrl(siteUrl, bird) {
  return siteUrl ? `${siteUrl}/oiseaux/${bird.slug}.html` : "";
}

function imageUrl(siteUrl, bird) {
  const imagePath = bird.image.replace(/^\.\//, "");
  return siteUrl ? `${siteUrl}/${imagePath}` : `../${imagePath}`;
}

function weatherLabel(bird) {
  return bird.weather.length === WEATHER_OPTIONS.length
    ? "toute météo"
    : bird.weather.join(", ");
}

function periodLabel(bird) {
  return bird.periods.length === PERIOD_OPTIONS.length
    ? "toute la journée"
    : bird.periods.join(", ");
}

function birdDescription(bird) {
  const alternateName = bird.englishName ? ` (${bird.englishName})` : "";
  return `Où trouver ${bird.name}${alternateName} dans Heartopia : ${bird.zones.join(", ")}, ${weatherLabel(bird)}, ${periodLabel(bird)}, niveau de passion ${bird.unlockLevel}.`;
}

function jsonForHtml(value) {
  return JSON.stringify(value, null, 2).replaceAll("<", "\\u003c");
}

function collectionStructuredData(siteUrl) {
  const website = {
    "@type": "WebSite",
    name: "Plumetopia",
    alternateName: "Plumetopia — Oiseaux de Heartopia",
    description:
      "Plumetopia répertorie tous les oiseaux de Heartopia avec leurs zones, météos, horaires et niveaux de passion.",
    inLanguage: "fr-FR",
  };
  if (siteUrl) website.url = `${siteUrl}/`;

  const list = {
    "@type": "ItemList",
    name: "Oiseaux de Heartopia",
    numberOfItems: INITIAL_BIRDS.length,
    itemListElement: INITIAL_BIRDS.map((bird, index) => {
      const item = {
        "@type": "WebPage",
        name: `${bird.name} dans Heartopia`,
      };
      if (bird.englishName) item.alternateName = bird.englishName;
      const url = pageUrl(siteUrl, bird);
      if (url) item.url = url;
      return {
        "@type": "ListItem",
        position: index + 1,
        item,
      };
    }),
  };

  const collection = {
    "@type": "CollectionPage",
    name: "Plumetopia — Tous les oiseaux de Heartopia",
    description:
      "Plumetopia répertorie tous les oiseaux de Heartopia avec leurs zones, météos, horaires et niveaux de passion.",
    inLanguage: "fr-FR",
    isAccessibleForFree: true,
    creator: { "@type": "Person", name: "Slyreus" },
    about: { "@type": "VideoGame", name: "Heartopia" },
    mainEntity: list,
  };
  if (siteUrl) collection.url = `${siteUrl}/`;

  return { "@context": "https://schema.org", "@graph": [website, collection] };
}

function birdStructuredData(siteUrl, bird) {
  const page = {
    "@type": "WebPage",
    name: `${bird.name} dans Heartopia`,
    description: birdDescription(bird),
    inLanguage: "fr-FR",
    isPartOf: { "@type": "WebSite", name: "Plumetopia" },
    about: { "@type": "VideoGame", name: "Heartopia" },
    mainEntity: {
      "@type": "Thing",
      name: bird.name,
      identifier: bird.id,
      image: imageUrl(siteUrl, bird),
    },
  };
  if (bird.englishName) page.mainEntity.alternateName = bird.englishName;
  const url = pageUrl(siteUrl, bird);
  if (url) page.url = url;
  return { "@context": "https://schema.org", ...page };
}

function renderBirdPage(siteUrl, bird) {
  const title = `${bird.name} dans Heartopia : zone, météo et horaire | Plumetopia`;
  const description = birdDescription(bird);
  const canonical = pageUrl(siteUrl, bird);
  const relativeImage = bird.image.replace(/^\.\//, "../");
  const englishName = bird.englishName
    ? `<p class="seo-bird-english" lang="en">${escapeHtml(bird.englishName)}</p>`
    : "";
  const event = bird.event || bird.season;
  const eventRow = event
    ? `<div><dt>Événement</dt><dd>${escapeHtml(event)}</dd></div>`
    : "";
  const canonicalTag = canonical
    ? `<link rel="canonical" href="${escapeHtml(canonical)}" />`
    : "";
  const socialImage = siteUrl ? imageUrl(siteUrl, bird) : "";
  const socialImageTag = socialImage
    ? `<meta property="og:image" content="${escapeHtml(socialImage)}" />`
    : "";

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#b9445a" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <meta property="og:locale" content="fr_FR" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Plumetopia" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${socialImageTag}
    <meta name="twitter:card" content="summary_large_image" />
    <title>${escapeHtml(title)}</title>
    ${canonicalTag}
    <link rel="icon" href="../assets/brand/favicon-64.png" type="image/png" sizes="64x64" />
    <link rel="stylesheet" href="../styles.css?v=20260717.3" />
    <script type="application/ld+json">${jsonForHtml(birdStructuredData(siteUrl, bird))}</script>
  </head>
  <body class="seo-bird-page">
    <header class="seo-bird-header">
      <a class="seo-bird-brand" href="../index.html" aria-label="Retour à Plumetopia">
        <img src="../assets/brand/plumetopia-logo.png" alt="" width="48" height="48" />
        <span><strong>Plumetopia</strong><small>Guide des oiseaux de Heartopia</small></span>
      </a>
    </header>
    <main class="seo-bird-main">
      <a class="seo-back-link" href="../index.html#catalogue">← Tous les oiseaux de Heartopia</a>
      <article class="seo-bird-sheet">
        <div class="seo-bird-visual">
          <img src="${escapeHtml(relativeImage)}" alt="${escapeHtml(`Illustration de ${bird.name} dans Heartopia`)}" width="800" height="800" />
        </div>
        <div class="seo-bird-content">
          <p class="eyebrow">Fiche oiseau Heartopia</p>
          <h1>${escapeHtml(bird.name)}</h1>
          ${englishName}
          <p class="seo-bird-summary">Dans Heartopia, <strong>${escapeHtml(bird.name)}</strong> se trouve à ${escapeHtml(bird.zones.join(", "))}. Cette fiche indique sa météo, ses horaires et le niveau de passion nécessaire.</p>
          <dl class="seo-bird-facts">
            <div><dt>Zone</dt><dd>${escapeHtml(bird.zones.join(" · "))}</dd></div>
            <div><dt>Météo</dt><dd>${escapeHtml(weatherLabel(bird))}</dd></div>
            <div><dt>Horaire</dt><dd>${escapeHtml(periodLabel(bird))}</dd></div>
            <div><dt>Niveau de passion</dt><dd>${escapeHtml(bird.unlockLevel)}</dd></div>
            <div><dt>Catégorie</dt><dd>${escapeHtml(bird.category || "Oiseau")}</dd></div>
            ${eventRow}
          </dl>
          <a class="button button-primary seo-catalog-link" href="../index.html?oiseau=${encodeURIComponent(bird.slug)}#catalogue">Ouvrir dans le catalogue interactif</a>
        </div>
      </article>
    </main>
    <footer class="site-footer seo-bird-footer">
      <p>Plumetopia — guide francophone non officiel des oiseaux de Heartopia.</p>
    </footer>
  </body>
</html>
`;
}

function renderSitemap(siteUrl, lastModified) {
  const baseUrl = siteUrl || "https://votre-domaine.fr";
  const entries = [
    { url: `${baseUrl}/`, priority: "1.0" },
    ...INITIAL_BIRDS.map((bird) => ({
      url: `${baseUrl}/oiseaux/${bird.slug}.html`,
      priority: "0.8",
    })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    ({ url, priority }) =>
      `  <url><loc>${escapeXml(url)}</loc><lastmod>${lastModified}</lastmod><changefreq>weekly</changefreq><priority>${priority}</priority></url>`,
  )
  .join("\n")}
</urlset>
`;
}

function renderRobots(siteUrl) {
  const sitemapLine = siteUrl
    ? `Sitemap: ${siteUrl}/sitemap.xml`
    : "# Configurez SITE_URL avant publication pour générer la ligne Sitemap absolue.";
  return `User-agent: *
Allow: /
Disallow: /admin/

${sitemapLine}
`;
}

export async function generateSeo({ outputDirectory = rootDirectory, siteUrl } = {}) {
  const resolvedOutput = path.resolve(outputDirectory);
  const configuredSiteUrl = normalizeSiteUrl(
    siteUrl ?? process.env.SITE_URL ?? SITE_CONFIG.siteUrl,
  );
  await mkdir(resolvedOutput, { recursive: true });

  const birdPagesDirectory = path.join(resolvedOutput, "oiseaux");
  if (
    path.dirname(birdPagesDirectory) !== resolvedOutput ||
    path.basename(birdPagesDirectory) !== "oiseaux"
  ) {
    throw new Error("Répertoire SEO inattendu : génération interrompue.");
  }
  await rm(birdPagesDirectory, { recursive: true, force: true });
  await mkdir(birdPagesDirectory, { recursive: true });

  await Promise.all(
    INITIAL_BIRDS.map((bird) =>
      writeFile(
        path.join(birdPagesDirectory, `${bird.slug}.html`),
        renderBirdPage(configuredSiteUrl, bird),
        "utf8",
      ),
    ),
  );

  const lastModified = new Date().toISOString().slice(0, 10);
  const sitemapFilename = configuredSiteUrl ? "sitemap.xml" : "sitemap.xml.example";
  await writeFile(
    path.join(resolvedOutput, sitemapFilename),
    renderSitemap(configuredSiteUrl, lastModified),
    "utf8",
  );
  await writeFile(
    path.join(resolvedOutput, "robots.txt"),
    renderRobots(configuredSiteUrl),
    "utf8",
  );

  const indexPath = path.join(resolvedOutput, "index.html");
  const indexHtml = await readFile(indexPath, "utf8");
  const seoBlock = `<!-- SEO_CATALOG_START -->\n    <script type="application/ld+json" id="seoCatalogData">\n${jsonForHtml(collectionStructuredData(configuredSiteUrl))}\n    </script>\n    <!-- SEO_CATALOG_END -->`;
  const seoBlockPattern = /<!-- SEO_CATALOG_START -->[\s\S]*?<!-- SEO_CATALOG_END -->/;
  if (!seoBlockPattern.test(indexHtml)) {
    throw new Error("Marqueurs SEO absents de index.html.");
  }
  const updatedIndex = indexHtml.replace(seoBlockPattern, seoBlock);
  await writeFile(indexPath, updatedIndex, "utf8");

  console.log(
    `SEO généré : ${INITIAL_BIRDS.length} fiches oiseaux et ${sitemapFilename}${configuredSiteUrl ? ` pour ${configuredSiteUrl}` : " (URL de production à configurer)"}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await generateSeo();
}
