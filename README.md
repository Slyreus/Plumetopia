# Plumetopia

Plumetopia est un guide francophone, mobile-first et non officiel des oiseaux de Heartopia, développé par **Slyreus**. La version locale contient 97 fiches interactives avec recherche, priorités météo, périodes, zones, niveaux de passion et carnet synchronisable.

## Images

Les 97 fiches utilisent les détourage HD en PNG du dossier `assets/birds/oiseaux_hd/`. Le nom anglais de chaque fichier est associé à l'identifiant interne de la fiche ; les sept écarts historiques sont documentés explicitement dans `data/birds.js` afin de garantir une correspondance bijective.

Les WebP d'origine restent dans le même dossier comme sources non destructives. Une URL HTTPS ou un autre chemin d'image peut toujours être défini fiche par fiche depuis l'administration.

## Logique météo

L'arc-en-ciel rend tous les oiseaux observables. Le filtre météo sert donc à afficher les oiseaux à **prioriser**, et non tous ceux techniquement compatibles :

- **Spécial soleil** : visibles au soleil mais pas sous la pluie ;
- **Spécial pluie** : visibles sous la pluie mais pas au soleil ;
- **Exclusif arc-en-ciel** : invisibles au soleil comme sous la pluie ;
- **Tous les oiseaux** : aucun filtre météo.

Les compteurs de ces profils sont calculés directement depuis les données validées de chaque fiche.

## Collections événementielles

La **Collection principale** contient 77 oiseaux, dont les huit oiseaux de l’Event Oiseau. Pour ceux-ci, l’événement est indiqué directement dans la localisation. Les 20 oiseaux saisonniers spéciaux sont répartis dans quatre collections : Saison des baleines, Saison des neiges, Rues modulaires et Rêves Projetés.

Depuis la **Collection principale**, une recherche textuelle peut toujours retrouver un oiseau d'une collection spéciale si les mots saisis correspondent à son nom français ou anglais. Une recherche par zone ou description ne réinjecte pas ces collections dans le catalogue principal.

## Référencement

Le générateur crée 97 fiches HTML statiques dans `oiseaux/`, un sitemap complet et les données structurées JSON-LD du catalogue :

```powershell
$env:SITE_URL = "https://votre-domaine.fr"
npm run generate:seo
```

Sans domaine configuré, il génère `sitemap.xml.example` et omet les URL canoniques pour éviter de publier une fausse adresse. Les pages restent consultables localement et utilisent uniquement des liens relatifs compatibles avec un sous-dossier GitHub Pages.

Les noms français et anglais, Heartopia, les zones, la météo, les horaires et les niveaux sont présents dans des titres et contenus naturels propres à chaque fiche. Les cartes du catalogue sont de vrais liens HTML crawlables, tout en conservant l'ouverture rapide de la modale. Aucun texte caché ni bourrage artificiel de mots-clés n'est utilisé : les données invisibles sont limitées au JSON-LD conforme au contenu visible.

Après déploiement HTTPS :

1. renseigner `siteUrl` dans `site-config.js` ;
2. régénérer le sitemap ;
3. ajouter la ligne absolue `Sitemap:` dans `robots.txt` ;
4. créer une propriété Domaine Google Search Console ;
5. valider le domaine avec le TXT DNS fourni par Google ;
6. soumettre `/sitemap.xml` et contrôler quelques fiches avec l'inspection d'URL.

Les modifications Supabase sont visibles immédiatement dans le catalogue public. Après une modification durable du catalogue local, relancez `npm run generate:seo` afin de synchroniser les fiches statiques.

Google n'utilise pas la balise `meta keywords`. Le référencement repose ici sur le contenu français visible, les données structurées, les images descriptives et de bonnes performances mobiles.

## Publication sur GitHub Pages

Le workflow `.github/workflows/pages.yml` teste, construit et publie automatiquement le site à chaque push sur `main`. Il récupère l'URL réelle fournie par GitHub Pages, puis génère les canonical, `robots.txt` et `sitemap.xml` avec cette adresse.

Sur GitHub, ouvrez **Settings → Pages**, choisissez **GitHub Actions** comme source, puis poussez la branche `main`. Le dossier `_site` est un artefact de build et ne doit pas être ajouté au dépôt.

## Vérification des fiches

Les informations seront revérifiées directement dans le jeu par Slyreus. La base éditable se trouve dans `data/birds.js` et pourra ensuite être mise à jour en direct depuis l'atelier administrateur.
