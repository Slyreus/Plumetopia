import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { INITIAL_BIRDS, PERIOD_OPTIONS, WEATHER_OPTIONS } from "../data/birds.js";
import { EVENT_CATALOGS, getEventCatalog } from "../data/events.js";
import {
  MAIN_COLLECTION_REFERENCE_ROWS,
  REMOVED_MAIN_BIRDS,
} from "../data/main-collection-reference.js";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("la base contient 77 oiseaux principaux et 20 oiseaux événementiels", () => {
  assert.equal(MAIN_COLLECTION_REFERENCE_ROWS.length, 77);
  assert.equal(INITIAL_BIRDS.length, 97);
  assert.equal(new Set(INITIAL_BIRDS.map((bird) => bird.id)).size, 97);
});

test("la Collection principale reproduit la référence validée et harmonisée", () => {
  const weatherValues = {
    "/": WEATHER_OPTIONS,
    "Arc-en-ciel": ["Arc-en-ciel"],
    "Soleil ou arc-en-ciel": ["Soleil", "Arc-en-ciel"],
    "Pluie ou arc-en-ciel": ["Pluie", "Arc-en-ciel"],
  };
  const periodValues = {
    "/": PERIOD_OPTIONS,
    "12h00 à 6h00": ["Après-midi", "Soir", "Nuit"],
    "6h00 à 00h00": ["Matin", "Après-midi", "Soir"],
    "18h00 à 12h00": ["Soir", "Nuit", "Matin"],
    "12h00 à 0h00": ["Après-midi", "Soir"],
    "00h00 à 12h00": ["Nuit", "Matin"],
  };

  for (const reference of MAIN_COLLECTION_REFERENCE_ROWS) {
    const bird = INITIAL_BIRDS.find((item) => item.id === reference.id);
    assert.ok(bird, reference.id);
    assert.equal(bird.name, reference.name, reference.id);
    assert.ok(bird.englishName.length >= 2, reference.id);
    assert.deepEqual(bird.zones, [reference.location], reference.id);
    assert.deepEqual(bird.weather, weatherValues[reference.weather], reference.id);
    assert.deepEqual(bird.periods, periodValues[reference.schedule], reference.id);
    assert.equal(bird.unlockLevel, reference.level, reference.id);
    assert.equal(bird.confidence, "vérifié en jeu", reference.id);
    assert.deepEqual(bird.sources, [], reference.id);
  }

  for (const removed of REMOVED_MAIN_BIRDS) {
    assert.equal(INITIAL_BIRDS.some((bird) => bird.id === removed.id), false, removed.id);
  }
});

test("chaque fiche contient les champs publics obligatoires", () => {
  for (const bird of INITIAL_BIRDS) {
    assert.match(bird.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(bird.name.length >= 2);
    assert.ok(Array.isArray(bird.zones) && bird.zones.length >= 1);
    assert.ok(Number.isInteger(bird.unlockLevel));
    assert.ok(bird.unlockLevel >= 1 && bird.unlockLevel <= 14);
    assert.equal(bird.details, "");
    assert.ok(bird.coordinates === null);
    assert.ok(bird.sources.every((source) => source.startsWith("https://")));
  }
});

test("chaque fiche possède une image HD PNG locale distincte et accessible", async () => {
  const images = new Set();

  for (const bird of INITIAL_BIRDS) {
    assert.match(
      bird.image,
      /^\.\/assets\/birds\/oiseaux_hd\/[a-z0-9-]+\.png$/,
    );
    await access(path.resolve(rootDirectory, bird.image));
    images.add(bird.image);
  }

  assert.equal(images.size, INITIAL_BIRDS.length);
  assert.equal(
    INITIAL_BIRDS.find((bird) => bird.id === "purple-finch")?.image,
    "./assets/birds/oiseaux_hd/redpoll.png",
  );
  assert.equal(
    INITIAL_BIRDS.find((bird) => bird.id === "wallace-fruit-dove")?.image,
    "./assets/birds/oiseaux_hd/wallaces-fruit-dove.png",
  );
  assert.ok(
    INITIAL_BIRDS.filter((bird) => bird.id.startsWith("winter-frost-season-winter-")).every(
      (bird) => bird.image.includes("/winter-") && !bird.image.includes("winter-frost-season"),
    ),
  );
});

test("les valeurs de météo et période sont contrôlées", () => {
  for (const bird of INITIAL_BIRDS) {
    assert.ok(bird.weather.length >= 1);
    assert.ok(bird.periods.length >= 1);
    assert.ok(bird.weather.every((value) => WEATHER_OPTIONS.includes(value)));
    assert.ok(bird.periods.every((value) => PERIOD_OPTIONS.includes(value)));
  }
});

test("les priorités météo isolent les oiseaux réellement dépendants", () => {
  const counts = {
    sun: INITIAL_BIRDS.filter(
      (bird) => bird.weather.includes("Soleil") && !bird.weather.includes("Pluie"),
    ).length,
    rain: INITIAL_BIRDS.filter(
      (bird) => bird.weather.includes("Pluie") && !bird.weather.includes("Soleil"),
    ).length,
    rainbow: INITIAL_BIRDS.filter(
      (bird) =>
        bird.weather.includes("Arc-en-ciel") &&
        !bird.weather.includes("Soleil") &&
        !bird.weather.includes("Pluie"),
    ).length,
  };

  assert.deepEqual(counts, { sun: 7, rain: 10, rainbow: 7 });
});

test("les oiseaux spéciaux sont répartis dans quatre collections dédiées", () => {
  const counts = { base: 0 };

  for (const bird of INITIAL_BIRDS) {
    const catalog = getEventCatalog(bird.event || bird.season);
    if (!catalog) counts.base += 1;
    else counts[catalog.id] = (counts[catalog.id] || 0) + 1;
  }

  assert.deepEqual(counts, {
    base: 77,
    "saison-du-givre": 5,
    "rues-modulaires": 5,
    "cinematiques-oniriques": 5,
    "appel-des-baleines": 5,
  });
});

test("les collections événementielles utilisent leurs nouveaux noms", () => {
  const labelsById = Object.fromEntries(
    EVENT_CATALOGS.map((catalog) => [catalog.id, catalog.label]),
  );

  assert.equal(labelsById["appel-des-baleines"], "Saison des baleines");
  assert.equal(labelsById["saison-du-givre"], "Saison des neiges");
  assert.equal(labelsById["cinematiques-oniriques"], "Rêves Projetés");

  // Les anciens libellés restent reconnus pour les éventuelles lignes Supabase existantes.
  assert.equal(getEventCatalog("Appel des baleines")?.id, "appel-des-baleines");
  assert.equal(getEventCatalog("Saison du Givre")?.id, "saison-du-givre");
  assert.equal(getEventCatalog("Cinématiques oniriques")?.id, "cinematiques-oniriques");
});

test("le Nid des Centaines reste dans la collection principale avec sa localisation", () => {
  const nestReferences = MAIN_COLLECTION_REFERENCE_ROWS.filter((row) =>
    row.location.startsWith("Event Oiseau"),
  );
  const nestBirds = nestReferences.map((row) =>
    INITIAL_BIRDS.find((bird) => bird.id === row.id),
  );

  assert.equal(nestReferences.length, 8);
  assert.equal(nestBirds.length, 8);
  assert.ok(nestBirds.every(Boolean));
  assert.deepEqual(nestBirds.map((bird) => bird.zones[0]), nestReferences.map((row) => row.location));
  assert.ok(nestBirds.every((bird) => !bird.event && !bird.season));
  assert.ok(nestBirds.every((bird) => getEventCatalog(bird.event || bird.season) === null));
});

test("la seconde zone de l'Event Oiseau est présentée comme un bonus", () => {
  const bonusReferences = MAIN_COLLECTION_REFERENCE_ROWS.filter(
    (row) => row.location === "Event Oiseau (Bonus)",
  );

  assert.deepEqual(
    bonusReferences.map((row) => row.id),
    ["green-peafowl", "white-peafowl"],
  );
  assert.ok(MAIN_COLLECTION_REFERENCE_ROWS.every((row) => !row.location.includes("2e zone")));
});

test("les localisations publiques sont harmonisées sans anciens doublons", () => {
  const aegithalos = INITIAL_BIRDS.find((bird) => bird.id === "long-tailed-tit");
  const zones = new Set(INITIAL_BIRDS.flatMap((bird) => bird.zones));
  const obsoleteLabels = [
    "Mont Onsen",
    "Mont Onsen — lac du cratère",
    "Montagne thermale - Lac Volcanique",
    "Lac de Banlieue",
    "Lac Montagne Thermale",
    "Lac de Montagne thermale",
    "Champ de fleurs - Plage Violette",
    "Champ de fleurs - Moulin à vent",
    "Champs de fleurs - Moulins à vent",
    "Forêt - Tour faon",
    "Forêt - Forêt de chênes spirituel",
    "Mer calme",
  ];

  assert.deepEqual(aegithalos?.zones, ["Sommet de tête de Blanc"]);
  assert.equal(zones.size, 46);
  assert.ok(obsoleteLabels.every((label) => !zones.has(label)));
  assert.equal(
    INITIAL_BIRDS.filter((bird) => bird.zones.includes("Montagne thermale - Lac volcanique"))
      .length,
    3,
  );
});

test("les brouillons ne conservent aucune ancienne traduction de localisation", async () => {
  const source = await readFile(path.join(rootDirectory, "data", "birds.js"), "utf8");
  const blockPattern = /createBird\(\{\s*id: "([^"]+)"[\s\S]*?\n\s*zones: \[(.*?)\],/g;
  let match;
  let draftCount = 0;

  while ((match = blockPattern.exec(source))) {
    const bird = INITIAL_BIRDS.find((item) => item.id === match[1]);
    assert.ok(bird, match[1]);
    assert.deepEqual(JSON.parse(`[${match[2]}]`), bird.zones, match[1]);
    draftCount += 1;
  }

  assert.equal(draftCount, INITIAL_BIRDS.length);
  assert.doesNotMatch(
    source,
    /Mont Onsen|Champ fleuri|Mer du Zéphyr|Nid des Centaines|tour aux cerfs|lac du cratère|Rivière Rosée|Zone centrale|Perchoir spécial|mer de la Baleine|littoral Est|falaise de pierre/i,
  );
});

test("chaque oiseau possède une fiche statique indexable reliée au catalogue", async () => {
  const birdPageDirectory = path.join(rootDirectory, "oiseaux");
  const birdPages = (await readdir(birdPageDirectory)).filter((name) => name.endsWith(".html"));
  const html = await readFile(path.join(rootDirectory, "index.html"), "utf8");
  const sitemap = await readFile(path.join(rootDirectory, "sitemap.xml.example"), "utf8");
  const app = await readFile(path.join(rootDirectory, "app.js"), "utf8");
  const pagesBuild = await readFile(path.join(rootDirectory, "scripts", "build-pages.mjs"), "utf8");
  const googleVerification = await readFile(
    path.join(rootDirectory, "googlecbcd18f0cc8cb95a.html"),
    "utf8",
  );
  const bingVerification = await readFile(
    path.join(rootDirectory, "BingSiteAuth.xml"),
    "utf8",
  );
  assert.equal(birdPages.length, INITIAL_BIRDS.length);
  assert.match(app, /\.\/oiseaux\/\$\{encodeURIComponent\(bird\.slug \|\| bird\.id\)\}\.html/);
  assert.match(app, /new URLSearchParams\(window\.location\.search\)\.get\("oiseau"\)/);
  assert.match(pagesBuild, /"googlecbcd18f0cc8cb95a\.html"/);
  assert.match(pagesBuild, /"BingSiteAuth\.xml"/);
  assert.equal(
    googleVerification.trim(),
    "google-site-verification: googlecbcd18f0cc8cb95a.html",
  );
  assert.match(bingVerification, /<user>A320DA806407ECDFA6567E5D31FE43FD<\/user>/);
  assert.equal((sitemap.match(/<url>/g) || []).length, INITIAL_BIRDS.length + 1);
  for (const bird of INITIAL_BIRDS) {
    assert.ok(birdPages.includes(`${bird.slug}.html`), bird.slug);
    assert.match(sitemap, new RegExp(`/oiseaux/${bird.slug}\\.html`));
  }
  const samplePage = await readFile(
    path.join(birdPageDirectory, "african-olive-pigeon.html"),
    "utf8",
  );
  const aegithalosPage = await readFile(
    path.join(birdPageDirectory, "long-tailed-tit.html"),
    "utf8",
  );
  assert.match(samplePage, /<title>[^<]+Heartopia[^<]+Plumetopia<\/title>/);
  assert.match(samplePage, /type="application\/ld\+json"/);
  assert.match(samplePage, /African Olive Pigeon/);
  assert.match(samplePage, /index, follow/);
  assert.match(aegithalosPage, /Sommet de tête de Blanc/);
  assert.match(html, /id="detailMapButton"/);
  assert.doesNotMatch(html, /detailPermalink|Voir la page complète/);
});

test("la page principale n'a pas d'identifiants HTML dupliqués", async () => {
  const html = await readFile(path.join(rootDirectory, "index.html"), "utf8");
  const styles = await readFile(path.join(rootDirectory, "styles.css"), "utf8");
  const app = await readFile(path.join(rootDirectory, "app.js"), "utf8");
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /Guide Heartopia non officiel/);
  assert.doesNotMatch(html, /Guide français non officiel/);
  assert.match(html, /<meta name="author" content="Slyreus" \/>/);
  assert.match(html, /Développé par/);
  assert.match(html, />Slyreus</);
  assert.match(html, /UID Global : <strong>3msn0jwk<\/strong>/);
  assert.match(html, /type="module" src="\.\/app\.js(?:\?[^\"]+)?"/);
  assert.match(html, /id="discordLoginButton"/);
  assert.match(html, /id="discordLoginTooltip"/);
  assert.match(html, /Indisponible pour le moment/);
  assert.match(html, /sauvegarder votre carnet/);
  assert.match(html, /id="adminAccessButton"[^>]*hidden/);
  assert.match(html, /Priorité météo/);
  assert.match(html, /id="catalogTabs"/);
  assert.match(html, /Collection principale/);
  assert.match(html, /Les événements spéciaux ont chacun leur collection/);
  assert.doesNotMatch(html, /Oiseaux de base/);
  assert.doesNotMatch(html, /Montre les oiseaux rares à privilégier maintenant/);
  assert.doesNotMatch(html, /hero-scene|scene-bird/);
  assert.doesNotMatch(html, />4<\/dt>[\s\S]*?<dd>périodes<\/dd>/);
  const heroTitle = html.match(/<h1 id="heroTitle">([\s\S]*?)<\/h1>/)?.[1] || "";
  assert.doesNotMatch(heroTitle, /<br\s*\/?\s*>/i);
  assert.match(html, /<time datetime="2026-07-16">Mis à jour le 16 juillet 2026<\/time>/);
  assert.match(html, /class="hero-summary"/);
  assert.match(html, /assets\/brand\/favicon-64\.png/);
  assert.match(html, /<title>Plumetopia — Tous les oiseaux de Heartopia<\/title>/);
  assert.match(html, /Plumetopia répertorie tous les oiseaux de Heartopia/);
  assert.match(html, /rel="shortcut icon" href="\.\/assets\/brand\/favicon-64\.png"/);
  assert.match(html, /"alternateName": "Plumetopia — Oiseaux de Heartopia"/);
  assert.match(html, /assets\/brand\/plumetopia-logo\.png/);
  assert.doesNotMatch(html, /assets\/brand\/plumetopia\.svg/);
  assert.match(styles, /--body-zone: #fff0d3/);
  assert.match(styles, /\.site-footer\s*\{[\s\S]*?background: linear-gradient\(135deg, #713246, #8f4357\)/);
  assert.match(styles, /\.site-header\s*\{[\s\S]*?background: linear-gradient\(135deg, #713246, #8f4357\)[\s\S]*?color: #fff8ed;/);
  assert.doesNotMatch(html, /id="resultSummary"|class="result-summary"/);
  assert.doesNotMatch(app, /resultSummary/);
  assert.doesNotMatch(styles, /\.result-summary/);
  assert.match(styles, /\.catalog-header h2\s*\{[\s\S]*?font-size: clamp\(1\.55rem, 3vw, 2\.05rem\)/);
  assert.match(styles, /\.filter-panel-heading \.text-button\s*\{[\s\S]*?min-height: 0;[\s\S]*?font-size: 0\.66rem;/);
  assert.match(styles, /\.footer-credit\s*\{[\s\S]*?align-self: center;[\s\S]*?min-height: 44px;/);
  assert.match(html, /class="game-tip"/);
  assert.match(html, /id="gameTipText"/);
  assert.ok(html.indexOf('class="game-tip"') > html.indexOf("</main>"));
  assert.ok(html.indexOf('class="game-tip"') < html.indexOf('class="site-footer"'));
  assert.match(styles, /\.game-tip/);
  assert.match(styles, /\.discord-login-shell\.is-unavailable:hover \.discord-login-tooltip/);
  assert.match(html, /"@type": "ItemList"/);
  assert.match(html, /"numberOfItems": 97/);
  assert.match(app, /const GAME_TIPS = Object\.freeze\(\[/);
  assert.match(app, /Bailey/);
  assert.match(app, /Chaque jour, donne cinq cartes d’oiseaux à Bailey/);
  assert.match(app, /photo bien cadrée[\s\S]*assure-toi qu’il n’y a pas d’obstacle[\s\S]*distance de 4 m ou moins/);
  assert.doesNotMatch(app, /ta position réelle n’a pas d’importance/);
  assert.doesNotMatch(app, /place-toi à moins de quatre mètres/);
  assert.match(html, /class="intro-zone"/);
  assert.match(html, /class="catalog-zone"/);
  assert.match(styles, /\.intro-zone\s*\{[\s\S]*?border-bottom: 2px solid var\(--line-strong\)/);
  assert.match(html, /Niveau de passion/);
  assert.match(html, /value="level-desc" selected>Niveau décroissant/);
  assert.match(html, /id="sortSelectedValue">Niveau décroissant/);
  assert.match(html, /data-value="level-desc" aria-selected="true"/);
  assert.match(app, /sort: "level-desc"/);
  assert.match(html, /id="sortSelectTrigger"[\s\S]*?role="combobox"[\s\S]*?aria-controls="sortOptions"/);
  assert.match(styles, /\.sort-menu\s*\{[\s\S]*?border-radius: 20px;/);
  assert.match(app, /function setActiveSortOptionFromText\(key\)/);
  assert.match(
    app,
    /sortMenu\.addEventListener\("pointerdown",[\s\S]*?event\.preventDefault\(\)/,
  );
  assert.equal((html.match(/class="collection-view-grid js-collection-view"/g) || []).length, 2);
  assert.doesNotMatch(html, /Afficher seulement mes observations|js-observed-only/);
  assert.match(styles, /\.finder\.is-docked/);
  assert.match(styles, /\.finder\s*\{[\s\S]*?border-top-color: transparent;[\s\S]*?border-radius: 0 0 var\(--radius-lg\) var\(--radius-lg\);/);
  assert.doesNotMatch(styles, /\.catalog-zone-inner\s*\{\s*padding-top:/);
  assert.doesNotMatch(styles, /\.finder\s*\{[^}]*border-radius: 999px;/);
  assert.match(styles, /\.bird-image-cutout/);
  assert.match(styles, /\.has-cutout-image/);
  assert.match(app, /header\.append\(media, nameLine, observeButton\)/);
  assert.match(app, /card\.append\(body\)/);
  assert.doesNotMatch(app, /card\.append\(media, body\)|media\.append\(observeButton\)/);
  assert.match(styles, /\.bird-card-header\s*\{[\s\S]*?grid-template-columns: 72px minmax\(0, 1fr\) 42px;/);
  assert.match(styles, /\.bird-card-media\s*\{[\s\S]*?width: 72px;[\s\S]*?height: 72px;[\s\S]*?border-radius: 50%;/);
  assert.doesNotMatch(styles, /\.bird-card-media\s*\{[^}]*aspect-ratio: 4 \/ 3;/);
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.filter-choice\[aria-pressed="true"\]\s*\{[\s\S]*?transform: none;/);
  assert.match(styles, /\.catalog-tab\[aria-selected="true"\]\s*\{[\s\S]*?transform: none;/);
  assert.match(styles, /\.filter-choice\[aria-pressed="true"\] \.filter-choice-icon::after\s*\{[\s\S]*?content: "";[\s\S]*?background-image:/);
  assert.match(styles, /\.catalog-tab\[aria-selected="true"\] \.catalog-tab-icon::after\s*\{[\s\S]*?content: "";[\s\S]*?background-image:/);
  assert.doesNotMatch(styles, /\.filter-choice\[aria-pressed="true"\]\s*\{[^}]*border-width:/);
  assert.doesNotMatch(styles, /\.catalog-tab\[aria-selected="true"\]\s*\{[^}]*border-width:/);
  assert.doesNotMatch(styles, /inset 4px 0 0 var\(--sage-800\)/);
  assert.doesNotMatch(styles, /inset 0 -4px 0 var\(--event-border\)/);
  assert.doesNotMatch(styles, /\.desktop-filters\s*\{[^}]*overflow-y:/);
  assert.doesNotMatch(styles, /\.desktop-filters\s*\{[^}]*scrollbar-/);
  assert.match(styles, /\.desktop-filters \.weather-priority-grid\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(min-width: 1040px\) and \(max-height: 820px\)[\s\S]*?\.desktop-filters\s*\{[\s\S]*?position: static;/);
  assert.match(styles, /\.mobile-filter-content::-webkit-scrollbar\s*\{[\s\S]*?display: none;/);
  assert.doesNotMatch(html, /id="quickWeatherButtons"/);
  assert.doesNotMatch(html, /js-availability-select/);
  assert.doesNotMatch(html, /data-admin-trigger/);
  assert.doesNotMatch(html, /id="adminEmail"/);
  assert.doesNotMatch(html, /id="detailTip"|id="detailSources"/);
  assert.doesNotMatch(html, /name="tip"|name="sources"/);
  assert.doesNotMatch(html, /Conseil Plumetopia|guide-section|footer-links/);
  assert.match(app, /bird-condition-groups/);
  assert.match(app, /condition-row condition-row-weather/);
  assert.match(app, /condition-row condition-row-period/);
  assert.match(app, /function isAllWeather\(weather\)/);
  assert.equal((app.match(/"Toute météo"/g) || []).length, 2);
  assert.match(app, /condition-pill-icon", "☀"/);
  assert.match(app, /allWeatherIcon\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(app, /if \(details\) body\.append\(createElement\("p", "bird-details", details\)\)/);
  assert.match(app, /elements\.detailDescription\.hidden = !details/);
  assert.doesNotMatch(app, /formatNumber|bird-number|detailBirdNumber/);
  assert.doesNotMatch(html, /id="detailBirdNumber"|class="detail-number"/);
  assert.doesNotMatch(styles, /\.bird-number|\.detail-number/);
  assert.match(styles, /\.observe-fab\s*\{[\s\S]*?bottom: 16px;[\s\S]*?z-index: 3;/);
});

test("Discord et les carnets sont protégés côté Supabase", async () => {
  const auth = await readFile(path.join(rootDirectory, "auth.js"), "utf8");
  const admin = await readFile(path.join(rootDirectory, "admin.js"), "utf8");
  const html = await readFile(path.join(rootDirectory, "index.html"), "utf8");
  const schema = await readFile(path.join(rootDirectory, "supabase", "schema.sql"), "utf8");

  assert.match(auth, /provider:\s*"discord"/);
  assert.match(auth, /user_bird_observations/);
  assert.match(schema, /create table if not exists public\.admin_discord_users/);
  assert.match(schema, /i\.provider_id/);
  assert.match(schema, /create table if not exists public\.user_bird_observations/);
  assert.match(schema, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(schema, /public\.is_plumetopia_mfa_admin\(\)/);
  assert.doesNotMatch(schema, /raw_user_meta_data|user_metadata/);
  assert.match(admin, /draft\.details\.length > 0 && draft\.details\.length < 12/);
  assert.doesNotMatch(html, /<textarea name="details"[^>]*\srequired(?:\s|>)/);
  assert.match(schema, /char_length\(details\) = 0 or char_length\(details\) between 12 and 500/);
});
