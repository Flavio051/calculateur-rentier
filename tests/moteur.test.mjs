// Contrôle 1 : le moteur de calcul de index.html donne les mêmes résultats que Gui Storm,
// et les données pays / villes sont cohérentes.
// Lancement : node tests/moteur.test.mjs   (aucune dépendance)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(racine, "index.html"), "utf8");
const ref = JSON.parse(readFileSync(path.join(racine, "tests", "reference-guistorm.json"), "utf8"));

// Le moteur est le bloc /*CORE-START*/ … /*CORE-END*/ de index.html : on l'exécute tel quel, sans navigateur.
function chargerMoteur(source) {
  const morceaux = source.split("/*CORE-START*/");
  if (morceaux.length !== 2 || !morceaux[1].includes("/*CORE-END*/")) throw new Error("Bloc /*CORE-START*/ … /*CORE-END*/ introuvable (ou en double) dans index.html");
  const core = morceaux[1].split("/*CORE-END*/")[0];
  const m = {};
  new Function("out", core + "; Object.assign(out, { simulate, destination, effParams, COUNTRIES, BY, FX });")(m);
  return m;
}

// Ce que la page affiche pour un état donné, dans le même format que le relevé Gui Storm
function affiche(m, etat) {
  const p = m.effParams(etat);
  const d = m.destination(p.retireCountry, p.retireCity);
  const r = m.simulate(p, d, true);
  return {
    age: r.reached ? (r.n === 0 ? r.R + "*" : String(r.R)) : "—",
    capital: Math.round(r.reached ? r.CR : r.T),
    brut: Math.round(r.gross),
    net: Math.round(r.net),
    pension: r.spNet > 0 && !r.bridged && !(r.reached && r.R >= r.spAge) ? Math.round(r.tPension) : null,
  };
}

const LIBELLES = { age: "âge", capital: "capital", brut: "rente brute", net: "rente nette", pension: "objectif avec pension" };
const fmt = v => (typeof v === "number" ? v.toLocaleString("fr-FR") : String(v));
let echecs = 0;
const erreurs = [];

// 1. Parité avec Gui Storm
let m;
try { m = chargerMoteur(html); }
catch (e) { console.error("✗ Impossible de charger le moteur : " + e.message); process.exit(1); }

const groupes = { O: "11 scénarios d'origine", B: "Batterie de 27 scénarios", R: "30 profils tirés au hasard" };
const parGroupe = {};
const tolerés = [], resolus = [];
for (const cas of ref.cas) {
  const g = cas.id[0];
  parGroupe[g] ??= { ok: 0, total: 0 };
  parGroupe[g].total++;
  let obtenu;
  try { obtenu = affiche(m, cas.etat); }
  catch (e) { erreurs.push(`✗ ${cas.id} ${cas.nom} : erreur JavaScript « ${e.message} »`); echecs++; continue; }
  const connus = new Set(cas.ecartConnu?.champs || []);
  const ecarts = [], ecartsConnus = [];
  for (const [champ, attendu] of Object.entries(cas.attendu)) {
    if (attendu === null || attendu === undefined) continue;
    if (obtenu[champ] === attendu) continue;
    (connus.has(champ) ? ecartsConnus : ecarts).push(`${LIBELLES[champ]} Gui Storm ${fmt(attendu)} / ici ${fmt(obtenu[champ])}`);
  }
  if (ecarts.length) { echecs++; erreurs.push(`✗ ${cas.id} ${cas.nom} : ${ecarts.join(" ; ")}`); continue; }
  parGroupe[g].ok++;
  if (ecartsConnus.length) tolerés.push(`  ~ ${cas.id} ${cas.nom} : ${ecartsConnus.join(" ; ")} (écart connu : ${cas.ecartConnu.raison})`);
  else if (cas.ecartConnu) resolus.push(`  ! ${cas.id} ${cas.nom} : désormais identique à Gui Storm, la mention « ecartConnu » peut être retirée.`);
}
console.log("Parité avec Gui Storm (relevé du " + ref.releve + ")");
for (const [g, lib] of Object.entries(groupes)) if (parGroupe[g]) console.log(`  ${parGroupe[g].ok === parGroupe[g].total ? "✓" : "✗"} ${lib} : ${parGroupe[g].ok}/${parGroupe[g].total}`);
for (const l of tolerés) console.log(l);
for (const l of resolus) console.log(l);

// 2. Cohérence des données
const pb = [];
const codes = new Set();
for (const c of m.COUNTRIES) {
  if (codes.has(c.code)) pb.push(`pays en double : ${c.code}`);
  codes.add(c.code);
  if (!(c.col > 0 && c.col < 5)) pb.push(`${c.name} : coût de la vie anormal (${c.col})`);
  if (!(c.tlo >= 0 && c.tlo <= c.thi && c.thi <= 60)) pb.push(`${c.name} : fiscalité incohérente (${c.tlo} % – ${c.thi} %)`);
  for (const k of ["sun", "safe", "health"]) if (!(c[k] >= 0 && c[k] <= 5)) pb.push(`${c.name} : note ${k} hors de 0–5 (${c[k]})`);
  if (!(c.le >= 50 && c.le <= 100)) pb.push(`${c.name} : espérance de vie anormale (${c.le})`);
  if (!c.note) pb.push(`${c.name} : note fiscale vide`);
  const noms = new Set();
  for (const v of c.cities) {
    if (noms.has(v.name)) pb.push(`${c.name} : ville en double ${v.name}`);
    noms.add(v.name);
    if (!(v.col > 0 && v.col < 5)) pb.push(`${v.name} : coût de la vie anormal (${v.col})`);
    for (const k of ["sun", "safe", "health"]) if (!(v[k] >= 0 && v[k] <= 5)) pb.push(`${v.name} : note ${k} hors de 0–5 (${v[k]})`);
    if (m.destination(c.code, v.name).city !== v.name) pb.push(`${v.name} : ville introuvable via destination()`);
  }
}
if (!m.BY.FR) pb.push("la France (FR) doit exister : c'est la référence du mode simplifié");
for (const [cur, taux] of Object.entries(m.FX)) if (!(taux > 0)) pb.push(`taux de change ${cur} invalide`);

// Chaque pays et chaque ville doit donner un résultat chiffré (pas de NaN), en simple comme en avancé
const base = ref.cas[0].etat;
let nbVilles = 0;
for (const c of m.COUNTRIES) {
  const lieux = [null, ...c.cities.map(v => v.name)];
  nbVilles += c.cities.length;
  for (const ville of lieux) for (const mode of ["simple", "advanced"]) for (const consume of [false, true]) {
    const etat = { ...base, mode, consume, retireCountry: c.code, retireCity: ville || "" };
    const r = m.simulate(m.effParams(etat), m.destination(c.code, ville), true);
    const vals = { T: r.T, R: r.R, gross: r.gross, net: r.net, CR: r.CR };
    const bad = Object.entries(vals).filter(([, v]) => !Number.isFinite(v)).map(([k]) => k);
    if (bad.length) pb.push(`${ville || c.name} (${mode}${consume ? ", consommer" : ""}) : résultat non chiffré pour ${bad.join(", ")}`);
  }
}
console.log(`Données : ${m.COUNTRIES.length} pays, ${nbVilles} villes`);
console.log(`  ${pb.length ? "✗" : "✓"} cohérence des données${pb.length ? " : " + pb.length + " problème(s)" : ""}`);
if (pb.length) { echecs += pb.length; erreurs.push(...pb.slice(0, 30).map(x => "✗ " + x)); }

if (echecs) {
  console.error("\n" + erreurs.join("\n"));
  // Sur GitHub, les échecs apparaissent aussi en annotations, lisibles sans ouvrir les journaux
  if (process.env.GITHUB_ACTIONS) for (const e of erreurs.slice(0, 10)) console.log(`::error title=Moteur::${e.replace(/%/g, "%25").replace(/\r?\n/g, "%0A")}`);
  console.error(`\n✗ ${echecs} problème(s) : ne pas publier cette version.`);
  process.exit(1);
}
console.log("\n✓ Moteur OK");
