import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INITIAL_BIRDS } from "../data/birds.js";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(rootDirectory, "assets", "birds", "generated");

const PALETTES = [
  ["#f16f82", "#f7a8a9", "#ffe0c2", "#8ac19a", "#dff3ed"],
  ["#5b9bb3", "#93ced0", "#ffe6a8", "#82ad77", "#e5f3dd"],
  ["#865f9d", "#c5a8d8", "#ffd4be", "#7eb6aa", "#e5f3f1"],
  ["#d78645", "#efb875", "#fff0bc", "#79aa82", "#e7f0d8"],
  ["#4d8175", "#8fc1a7", "#ffd6d6", "#d49a61", "#f5edd8"],
  ["#d55770", "#ea91ad", "#dfe5ff", "#7696c5", "#e7efff"],
  ["#6e7e3e", "#b3c66d", "#ffe2a8", "#d58969", "#f4eadb"],
  ["#4778ad", "#8aaee0", "#f9c8cc", "#6eaa93", "#e6f1eb"],
];

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const hashText = (value) =>
  [...String(value)].reduce((hash, character) => (hash * 33 + character.charCodeAt(0)) >>> 0, 5381);

function createArtwork(bird, index) {
  const hash = hashText(`${bird.id}-${bird.category}`);
  const [body, wing, accent, landscape, sky] = PALETTES[hash % PALETTES.length];
  const flip = hash % 2 === 0;
  const isWater = /eau|marin|flamant/i.test(bird.category);
  const isOwl = /nocturne|owl/i.test(`${bird.category} ${bird.englishName}`);
  const isRaptor = /rapace|falcon|kestrel/i.test(`${bird.category} ${bird.englishName}`);
  const isParrot = /perroquet|macaw/i.test(`${bird.category} ${bird.englishName}`);
  const isPeafowl = /paon|peafowl/i.test(`${bird.category} ${bird.englishName}`);
  const isFlamingo = /flamant|flamingo/i.test(`${bird.category} ${bird.englishName}`);
  const isEvent = Boolean(bird.event || bird.season || /événement/i.test(bird.category));
  const eyeX = isOwl ? 438 : 454;
  const secondEye = isOwl
    ? `<circle cx="411" cy="255" r="17" fill="#fffaf2"/><circle cx="411" cy="255" r="7" fill="#273b36"/>`
    : "";
  const crest = isOwl
    ? `<path d="M389 211 410 165 429 214M438 211l23-44 13 52" fill="${body}"/>`
    : isPeafowl || isParrot
      ? `<path d="M421 204c-16-38-4-59 7-73 7 29 18 48 34 67z" fill="${accent}"/>`
      : "";
  const beak = isRaptor || isParrot
    ? `<path d="M486 255c42-4 58 13 36 31-9 7-17 13-25 18 5-15 0-26-16-34z" fill="${accent}"/>`
    : `<path d="M486 255 548 278 487 296z" fill="${accent}"/>`;
  const legs = isFlamingo
    ? `<path d="M391 361 368 492M434 362l24 130" stroke="#c26874" stroke-width="11" stroke-linecap="round"/><path d="m368 492-31 13m121-13 31 13" stroke="#c26874" stroke-width="8" stroke-linecap="round"/>`
    : `<path d="M400 357v66m47-67v67" stroke="#755746" stroke-width="10" stroke-linecap="round"/>`;
  const peacockTail = isPeafowl
    ? `<g opacity=".95"><ellipse cx="287" cy="286" rx="118" ry="164" fill="${landscape}"/><circle cx="247" cy="222" r="24" fill="${accent}"/><circle cx="318" cy="204" r="24" fill="${accent}"/><circle cx="226" cy="304" r="24" fill="${accent}"/><circle cx="302" cy="292" r="24" fill="${accent}"/><circle cx="271" cy="375" r="24" fill="${accent}"/></g>`
    : `<path d="M337 298c-79 15-124 4-155-25 70-18 113-12 164 3z" fill="${wing}"/><path d="M340 324c-74 40-119 39-159 20 59-38 110-49 168-43z" fill="${accent}" opacity=".88"/>`;
  const eventDecor = isEvent
    ? `<g fill="${accent}" opacity=".78"><rect x="91" y="112" width="28" height="28" rx="6" transform="rotate(-12 91 112)"/><rect x="145" y="151" width="20" height="20" rx="5" transform="rotate(14 145 151)"/><path d="m674 126 9 20 22 3-16 15 4 22-19-11-20 11 5-22-16-15 22-3z"/></g>`
    : `<g fill="#fff8d0"><circle cx="116" cy="155" r="8"/><circle cx="675" cy="135" r="10"/><circle cx="708" cy="196" r="6"/></g>`;
  const water = isWater
    ? `<path d="M0 465q80-30 160 0t160 0 160 0 160 0 160 0v135H0z" fill="#a8d9dc"/><path d="M0 506q80-28 160 0t160 0 160 0 160 0 160 0" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="8"/>`
    : `<path d="M0 458c132-80 265-72 400 8 125-74 258-78 400-3v137H0z" fill="${landscape}"/><path d="M0 510c157-72 314-62 470 20 113-49 223-48 330-5v75H0z" fill="#68a87e" opacity=".78"/>`;
  const transform = flip ? "translate(800 0) scale(-1 1)" : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img">
  <title>${escapeXml(`Illustration originale stylisée de ${bird.name}`)}</title>
  <defs>
    <linearGradient id="sky-${index}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="#fff5d8"/></linearGradient>
    <filter id="shadow-${index}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#32483f" flood-opacity=".16"/></filter>
  </defs>
  <rect width="800" height="600" fill="url(#sky-${index})"/>
  <circle cx="670" cy="105" r="62" fill="#ffd268"/>
  <g fill="#fff" opacity=".88"><path d="M70 164c8-34 56-44 77-15 30-30 83-8 78 34H67c-9-5-8-14 3-19z"/><path d="M565 202c7-28 46-37 64-13 24-24 67-7 63 28H563c-7-4-7-11 2-15z"/></g>
  ${eventDecor}
  ${water}
  <g transform="${transform}" filter="url(#shadow-${index})">
    ${peacockTail}
    <path d="M195 428c129-24 271-20 408 5" fill="none" stroke="#715645" stroke-width="22" stroke-linecap="round"/>
    ${legs}
    <ellipse cx="395" cy="308" rx="116" ry="82" fill="${body}"/>
    <circle cx="430" cy="252" r="70" fill="${body}"/>
    ${crest}
    <path d="M339 283c38-31 93-26 124 16-20 52-78 75-134 42 4-22 7-40 10-58z" fill="${wing}"/>
    ${beak}
    <circle cx="${eyeX}" cy="248" r="14" fill="#fffaf2"/><circle cx="${eyeX}" cy="248" r="6" fill="#273b36"/>
    ${secondEye}
    <circle cx="457" cy="244" r="2.5" fill="#fff"/>
  </g>
  <g fill="#fff5bd"><circle cx="116" cy="530" r="14"/><circle cx="95" cy="530" r="8"/><circle cx="137" cy="530" r="8"/><circle cx="116" cy="509" r="8"/><circle cx="116" cy="551" r="8"/></g>
</svg>`;
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  INITIAL_BIRDS.map((bird, index) =>
    writeFile(path.join(outputDirectory, `${bird.id}.svg`), createArtwork(bird, index), "utf8"),
  ),
);

console.log(`${INITIAL_BIRDS.length} illustrations d'oiseaux générées dans assets/birds/generated.`);
