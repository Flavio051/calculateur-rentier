// Contrôle 2 : Bilan Locatif dans un vrai navigateur (Chromium)
// Chargement sans erreur, indicateurs identiques au moteur, saisie, sauvegarde, simulations, export/import, mobile.
// Lancement : node tests/page.test.mjs   (nécessite Playwright et Chart.js dans node_modules)
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fichier = process.env.PAGE || path.join(racine, "immobilier", "index.html");
const modules = process.env.NODE_MODULES || path.join(racine, "node_modules");
const require = createRequire(path.join(modules, "noop.js"));
let chromium; try { ({ chromium } = require("playwright")); } catch { console.error("✗ Playwright absent : lance « npm install »."); process.exit(1); }
const chartLocal = readFileSync(path.join(modules, "chart.js", "dist", "chart.umd.js"), "utf8");
const html = readFileSync(fichier, "utf8");

// Moteur de la page, pour calculer les valeurs attendues
const E = {}; new Function("out", html.split("/*CORE-START*/")[1].split("/*CORE-END*/")[0] + "; Object.assign(out, { simuler, normaliser, DEFAULT_SIM });")(E);
const eur = v => { const r = Math.round(v); return (r < 0 ? "−" : "") + new Intl.NumberFormat("fr-FR").format(Math.abs(r)) + " €"; };
const norm = t => String(t).replace(/[  ]/g, " ").trim();

const problemes = [];
const ok = m => console.log("  ✓ " + m);
const ko = m => { problemes.push(m); console.log("  ✗ " + m); if (process.env.GITHUB_ACTIONS) console.log(`::error title=Page immobilier::${m.replace(/%/g, "%25")}`); };
const verif = (cond, msg, detail) => cond ? ok(msg) : ko(msg + (detail ? " — " + detail : ""));

const serveur = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end(html); });
await new Promise(r => serveur.listen(0, "127.0.0.1", r));
const adresse = `http://127.0.0.1:${serveur.address().port}/`;
const nav = await chromium.launch();

async function page(w, h, scheme = "light") {
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, locale: "fr-FR" });
  const p = await ctx.newPage(); p.erreurs = [];
  p.on("pageerror", e => p.erreurs.push(e.message)); p.on("console", m => { if (m.type() === "error") p.erreurs.push(m.text()); });
  await p.route(/^https:\/\/cdnjs\.cloudflare\.com\//, r => r.fulfill({ status: 200, contentType: "application/javascript", body: chartLocal }));
  await p.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await p.goto(adresse); await p.waitForSelector("#k-v1");
  return p;
}
const texte = (p, s) => p.$eval(s, e => e.textContent).then(norm);

try {
  console.log("Bilan Locatif dans un navigateur (Chromium)");
  const p = await page(1440, 900);
  const R = E.simuler(E.DEFAULT_SIM);

  // 1. Première visite : l'exemple s'affiche, chiffres identiques au moteur
  verif(norm(await p.inputValue("#sim-name")) === E.DEFAULT_SIM.name, "exemple chargé à la première visite");
  verif(await texte(p, "#k-v1") === norm(eur(R.Y[1].cf) + " / an"), "cash-flow de l'année 2 identique au moteur", await texte(p, "#k-v1"));
  verif(await texte(p, "#k-v3") === norm(eur(R.mise)), "mise de départ identique au moteur");
  verif(await texte(p, "#k-v4") === norm(eur(R.rv.enrichissement)), "enrichissement identique au moteur");
  verif((await texte(p, "#f-notaire".replace("#", "#"))).length === 0 && norm(await p.inputValue("#f-notaire")) === norm(new Intl.NumberFormat("fr-FR").format(Math.round(R.notaire.total))), "frais de notaire calculés automatiquement (" + Math.round(R.notaire.total) + " €)");
  verif(await p.evaluate(() => !!(window.Chart && Chart.getChart(document.getElementById("c-cf")) && Chart.getChart(document.getElementById("c-enr")))), "graphiques de la synthèse dessinés");

  // 2. Saisie : changer le prix met tout à jour
  await p.fill("#f-prix", "150 000"); await p.waitForTimeout(80);
  const R2 = E.simuler(Object.assign({}, E.DEFAULT_SIM, { prix: 150000 }));
  verif(await texte(p, "#k-v1") === norm(eur(R2.Y[1].cf) + " / an"), "saisie du prix : cash-flow recalculé", await texte(p, "#k-v1"));
  verif(norm(await p.inputValue("#f-notaire")) === norm(new Intl.NumberFormat("fr-FR").format(Math.round(R2.notaire.total))), "saisie du prix : frais de notaire recalculés");
  await p.click('[data-step="1000"][data-for="f-prix"]'); await p.waitForTimeout(60);
  verif(norm(await p.inputValue("#f-prix")) === "151 000", "bouton + du prix (+1 000 €)", await p.inputValue("#f-prix"));
  await p.click('[data-step="-1000"][data-for="f-prix"]');

  // 3. Les 7 sections et les 6 analyses s'affichent
  for (const sec of ["fin", "expl", "charges", "fisc", "revente", "infos", "invest"]) await p.click(`[data-sec="${sec}"]`);
  verif((await p.$$("#form .fld")).length > 5, "les 7 sections des hypothèses s'ouvrent");
  const attendus = { treso: "#tr-t tbody tr", emprunt: "#c-loan", fisc: "#fi-t tbody tr", comparatif: "#cp-t tbody tr", revente: "#rv-s .stat", synthese: "#syn-facts .r" };
  for (const [tab, sel] of Object.entries(attendus)) { await p.click(`[data-ana="${tab}"]`); await p.waitForTimeout(60); const n = (await p.$$(sel)).length; verif(n > 0, `analyse « ${tab} » affichée (${n} éléments)`); }
  await p.click('[data-ana="comparatif"]'); verif((await p.$$("#cp-t tbody tr")).length === 6, "comparatif : 6 régimes");
  await p.click('[data-choose="lmnpReel"]'); await p.waitForTimeout(60);
  verif((await texte(p, "#k-s5")).startsWith("LMNP réel"), "bouton « Choisir » d'un régime appliqué");
  for (const sub of ["amort", "graph", "ech"]) { await p.click('[data-ana="emprunt"]'); await p.click(`[data-sub="emp:${sub}"]`); }
  verif((await p.$$("#ech-t tbody tr")).length > 5, "échéancier du prêt");
  await p.click('[data-ana="fisc"]'); await p.click('[data-sub="fisc:annee"]'); verif((await p.$$("#fi-l .r")).length > 5, "détail de l'impôt par année");

  // 4. Sauvegarde : un rechargement retrouve la saisie
  await p.click('[data-sec="expl"]'); await p.fill("#f-loyer", "900"); await p.waitForTimeout(50);
  await p.reload(); await p.waitForSelector("#k-v1"); await p.click('[data-sec="expl"]');
  verif(norm(await p.inputValue("#f-loyer")) === "900", "loyer retrouvé après rechargement immédiat");

  // 5. Simulations : nouvelle, liste, suppression avec confirmation
  await p.click("#btn-new"); await p.waitForTimeout(50);
  verif(norm(await p.inputValue("#sim-name")) === "Nouvelle simulation", "nouvelle simulation créée");
  await p.click("#btn-sims"); verif((await p.$$("#sims .simrow")).length === 2, "deux simulations dans la liste");
  await p.click("#sims [data-del]"); await p.click("#sims [data-delok]"); await p.waitForTimeout(50);
  verif((await p.$$("#sims .simrow")).length === 1, "suppression après confirmation dans la page");

  // 6. Export puis import
  await p.click("[data-export]"); const exp = await p.inputValue("#exp");
  let data = null; try { data = JSON.parse(exp); } catch {}
  verif(data && Array.isArray(data.sims) && data.sims.length === 1, "export JSON lisible");
  await p.click("[data-back]"); await p.click("[data-import]"); await p.fill("#imp", exp); await p.click("[data-doimport]"); await p.waitForTimeout(50);
  verif((await texte(p, "#imp-msg")).startsWith("1 simulation importée"), "import d'un export", await texte(p, "#imp-msg"));
  await p.keyboard.press("Escape");

  // 7. Bouton « Sombre » : bascule, enregistrement, graphiques redessinés
  await p.click('[data-ana="synthese"]');
  const fond = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const fondClair = await fond();
  await p.click("#theme-toggle"); await p.waitForTimeout(80);
  verif(await p.getAttribute("html", "data-theme") === "dark" && await p.getAttribute("#theme-toggle", "aria-pressed") === "true" && (await fond()) !== fondClair, "bouton « Sombre » : passage en thème sombre");
  verif(await p.evaluate(() => { const c = Chart.getChart(document.getElementById("c-cf")); return !!c && c.options.scales.y.ticks.color === getComputedStyle(document.documentElement).getPropertyValue("--muted").trim(); }), "thème sombre : graphiques redessinés aux couleurs du thème");
  await p.reload(); await p.waitForSelector("#k-v1");
  verif(await p.getAttribute("html", "data-theme") === "dark" && await p.getAttribute("#theme-toggle", "aria-pressed") === "true", "thème sombre retrouvé après rechargement");
  await p.click("#theme-toggle"); await p.waitForTimeout(50);
  verif(await p.getAttribute("html", "data-theme") === "light" && await p.getAttribute("#theme-toggle", "aria-pressed") === "false" && (await fond()) === fondClair, "bouton « Sombre » : retour au thème clair");
  verif(p.erreurs.length === 0, "aucune erreur JavaScript (ordinateur)", p.erreurs.slice(0, 3).join(" | "));
  await p.context().close();

  // 8. Mobile et thème sombre : pas de débordement, pas d'erreur
  for (const [w, h, sc] of [[390, 844, "light"], [390, 844, "dark"], [1024, 768, "dark"]]) {
    const q = await page(w, h, sc); let deb = 0;
    for (const tab of ["synthese", "treso", "emprunt", "fisc", "comparatif", "revente"]) { await q.click(`[data-ana="${tab}"]`); deb = Math.max(deb, await q.evaluate(() => document.documentElement.scrollWidth - innerWidth)); }
    for (const sec of ["fin", "expl", "charges", "fisc", "revente", "infos"]) { await q.click(`[data-sec="${sec}"]`); deb = Math.max(deb, await q.evaluate(() => document.documentElement.scrollWidth - innerWidth)); }
    verif(deb <= 1, `${w}×${h} ${sc === "dark" ? "sombre" : "clair"} : aucun défilement horizontal`, deb + " px");
    verif(q.erreurs.length === 0, `${w}×${h} ${sc === "dark" ? "sombre" : "clair"} : aucune erreur JavaScript`, q.erreurs.slice(0, 3).join(" | "));
    await q.context().close();
  }
} catch (e) {
  ko("le test a planté : " + (e && e.message ? e.message.split("\n")[0] : e));
} finally { await nav.close(); serveur.close(); }

if (problemes.length) { console.error(`\n✗ ${problemes.length} problème(s) : ne pas publier cette version.`); process.exit(1); }
console.log("\n✓ Page OK");
