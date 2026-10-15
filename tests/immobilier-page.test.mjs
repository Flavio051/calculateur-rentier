// Contrôle 2 : Bilan Locatif dans un vrai navigateur (Chromium)
// Chargement sans erreur, indicateurs identiques au moteur, saisie, sauvegarde, simulations, export/import,
// nouvelle simulation (surface, prix, loyer à remplir ; repères standards pour le reste), défilement du formulaire, mobile.
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
const E = {}; new Function("out", html.split("/*CORE-START*/")[1].split("/*CORE-END*/")[0] + "; Object.assign(out, { simuler, normaliser, DEFAULT_SIM, NOUVELLE_SIM });")(E);
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
const chiffres = t => String(t).replace(/[^\d,-]/g, "");
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
  verif(await p.$eval(".rail [data-sec]", e => e.dataset.sec) === "bien" && !!(await p.$("#t-ville")), "« Le bien » en première section, avec la ville");
  await p.click('[data-sec="invest"]');
  verif(norm(await p.inputValue("#f-notaire")) === norm(new Intl.NumberFormat("fr-FR").format(Math.round(R.notaire.total))), "frais de notaire calculés automatiquement (" + Math.round(R.notaire.total) + " €)");
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
  for (const sec of ["fin", "expl", "charges", "fisc", "revente", "bien", "invest"]) await p.click(`[data-sec="${sec}"]`);
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

  // 8. Nouvelle simulation : surface, prix et loyer à remplir soi-même, repères standards (en gris, cliquables) pour le reste
  {
    const q = await page(1440, 900);
    await q.click("#btn-new"); await q.waitForTimeout(60);
    const nv = o => Object.assign(JSON.parse(JSON.stringify(E.NOUVELLE_SIM)), o);
    verif(await q.$eval("#estbar", e => !e.hidden && e.classList.contains("manque")) && (await q.$$("#estbar [data-goto]")).length === 3, "nouvelle simulation : bandeau « Il manque 3 chiffres »");
    verif(await texte(q, "#k-v1") === "—" && !!(await q.$("#ana .attente")), "rien n'est calculé tant que surface, prix et loyer manquent");
    verif(await q.inputValue("#f-surface") === "" && (await q.getAttribute("#f-surface", "placeholder")) === "" && await q.$eval("#f-surface", e => e.closest(".inp").classList.contains("req")), "surface vide, marquée « à remplir », aucun chiffre inventé");
    verif(await q.$$eval("#aide a", l => l.map(a => a.href)).then(t => t.length === 1 && t[0].includes("explore.data.gouv.fr/immobilier")), "aide : un seul lien, l'explorateur DVF des ventes réelles");
    await q.fill("#t-ville", "Paris 11e"); await q.waitForTimeout(60);
    verif((await texte(q, "#aide")).includes("Loyers encadrés"), "Paris : rappel de l'encadrement des loyers");
    await q.click('#estbar [data-goto="prix"]'); await q.waitForTimeout(60);
    verif(await q.evaluate(() => document.activeElement && document.activeElement.id) === "f-prix-b", "bandeau : clic sur « Prix » → champ du prix");
    await q.fill("#f-surface", "30"); await q.fill("#f-prix-b", "280000"); await q.waitForTimeout(60);
    verif((await texte(q, "#ana .attente h3")).includes("un chiffre") && await texte(q, "#k-v1") === "—", "deux chiffres sur trois : il manque encore le loyer");
    await q.fill("#f-loyer-b", "1000"); await q.waitForTimeout(80);
    const o = { ville: "Paris 11e", surface: 30, prix: 280000, loyer: 1000 }, Rp = E.simuler(nv(o));
    verif(await texte(q, "#k-v1") === norm(eur(Rp.Y[1].cf) + " / an") && !!(await q.$("#syn-v")), "les trois chiffres remplis : bilan identique au moteur", await texte(q, "#k-v1"));
    verif(await q.$eval("#estbar", e => !e.classList.contains("manque")) && (await texte(q, "#estbar")).includes("repères standards"), "bandeau : chiffres venant de repères standards");
    const reperes = async () => (await q.$$eval("#form [data-tiers]", l => l.filter(e => e.querySelector(".tier")).map(e => e.dataset.tiers))).sort().join(",");
    await q.click('[data-sec="invest"]'); await q.waitForTimeout(40);
    verif(await reperes() === "mobilier", "investissement (meublé) : repères pour le mobilier seulement", await reperes());
    await q.click('[data-sec="fin"]'); await q.waitForTimeout(40);
    verif(await reperes() === "apport,caution,dossier", "financement : repères pour l'apport, les frais de dossier et la caution seulement", await reperes());
    verif((await q.getAttribute('[data-tiers="caution"] .tip', "data-tip")).replace(/[\s\u00a0\u202f]/g, "").includes(String(Math.round(Rp.emprunt))), "caution : le « i » donne le montant emprunté qui sert de base");
    await q.click('[data-sec="charges"]'); await q.waitForTimeout(60);
    verif(await reperes() === "autres.v,copro.v,gli.v,pno.v", "charges : repères pour copropriété, loyers impayés, PNO et imprévus seulement", await reperes());
    verif(await q.inputValue("#f-ch-tf") === "" && chiffres(await q.getAttribute("#f-ch-tf", "placeholder")) === String(Math.round(Rp.s.tf.v)), "taxe foncière vide : valeur en gris sans repères (" + Math.round(Rp.s.tf.v) + " €)");
    verif(await q.inputValue("#f-ch-copro") === "" && chiffres(await q.getAttribute("#f-ch-copro", "placeholder")) === String(Math.round(Rp.s.copro.v)), "copropriété vide, repère en gris (" + Math.round(Rp.s.copro.v) + " €)");
    const chips = await q.$$eval('[data-tiers="copro.v"] .tier', l => l.map(b => +b.dataset.v));
    verif(chips.length === 3 && chips[0] < chips[1] && chips[1] < chips[2], "trois repères de copropriété croissants", chips.join(" / "));
    await q.click('[data-tiers="copro.v"] .tier'); await q.waitForTimeout(60);
    const Rb = E.simuler(nv(Object.assign({}, o, { copro: { mode: "an", v: chips[0] } })));
    verif(chiffres(await q.inputValue("#f-ch-copro")) === String(chips[0]) && await texte(q, "#k-v1") === norm(eur(Rb.Y[1].cf) + " / an"), "clic sur un repère : champ rempli et résultat recalculé");
    await q.fill("#f-ch-copro", ""); await q.locator("#f-ch-copro").blur(); await q.waitForTimeout(60);
    verif(await q.inputValue("#f-ch-copro") === "" && await texte(q, "#k-v1") === norm(eur(Rp.Y[1].cf) + " / an"), "champ vidé : retour au repère");
    await q.fill("#f-ch-copro", String(Rp.s.copro.v)); await q.waitForTimeout(60);
    verif(await texte(q, "#k-v1") === norm(eur(Rp.Y[1].cf) + " / an"), "taper le repère ne change pas le résultat");
    await q.fill("#f-ch-copro", ""); await q.waitForTimeout(40);
    await q.reload(); await q.waitForSelector("#k-v1"); await q.click('[data-sec="charges"]');
    verif(await q.inputValue("#f-ch-tf") === "" && (await q.getAttribute("#f-ch-tf", "placeholder")) !== "" && await texte(q, "#k-v1") === norm(eur(Rp.Y[1].cf) + " / an"), "après rechargement : chiffres saisis gardés, repères toujours en gris");
    await q.click('[data-mode="rapide"]'); await q.waitForTimeout(40);
    const Rq = E.simuler(nv(Object.assign({}, o, { mode: "rapide" })));
    verif(chiffres(await texte(q, '[data-live="notaire"]')) === chiffres(eur(Rq.notaire.total)) && await texte(q, "#k-v1") === norm(eur(Rq.Y[1].cf) + " / an"), "estimation rapide : mêmes chiffres que le moteur", await texte(q, '[data-live="notaire"]'));
    await q.fill("#f-prix", ""); await q.waitForTimeout(60);
    verif(await texte(q, "#k-v1") === "—" && !!(await q.$("#ana .attente")), "prix effacé : le bilan attend de nouveau le prix");
    await q.click('[data-mode="complet"]');
    verif(q.erreurs.length === 0, "nouvelle simulation : aucune erreur JavaScript", q.erreurs.slice(0, 3).join(" | "));
    await q.context().close();
  }

  // 9. Ordinateur portable (écran bas) : le formulaire des hypothèses défile jusqu'en bas
  for (const [w, h] of [[1280, 720], [1440, 640]]) {
    const q = await page(w, h);
    await q.click('[data-sec="invest"]');
    const r = await q.evaluate(() => {
      const f = document.getElementById("form"), hy = document.querySelector(".hyp");
      window.scrollTo(0, 400); // la carte se colle sous le bandeau
      const avant = { sh: f.scrollHeight, ch: f.clientHeight };
      f.scrollTop = f.scrollHeight;
      const der = f.lastElementChild.getBoundingClientRect(), hb = hy.getBoundingClientRect();
      return { ...avant, derBas: Math.round(der.bottom), hypBas: Math.round(hb.bottom), vh: innerHeight };
    });
    verif(r.sh > r.ch && r.derBas <= r.hypBas + 1 && r.hypBas <= r.vh + 1, `${w}×${h} : le formulaire défile et son bas est atteignable`, JSON.stringify(r));
    await q.context().close();
  }

  // 10. Mobile et thème sombre : pas de débordement, pas d'erreur
  for (const [w, h, sc] of [[390, 844, "light"], [390, 844, "dark"], [1024, 768, "dark"]]) {
    const q = await page(w, h, sc); let deb = 0;
    for (const tab of ["synthese", "treso", "emprunt", "fisc", "comparatif", "revente"]) { await q.click(`[data-ana="${tab}"]`); deb = Math.max(deb, await q.evaluate(() => document.documentElement.scrollWidth - innerWidth)); }
    for (const sec of ["bien", "invest", "fin", "expl", "charges", "fisc", "revente"]) { await q.click(`[data-sec="${sec}"]`); deb = Math.max(deb, await q.evaluate(() => document.documentElement.scrollWidth - innerWidth)); }
    verif(deb <= 1, `${w}×${h} ${sc === "dark" ? "sombre" : "clair"} : aucun défilement horizontal`, deb + " px");
    verif(q.erreurs.length === 0, `${w}×${h} ${sc === "dark" ? "sombre" : "clair"} : aucune erreur JavaScript`, q.erreurs.slice(0, 3).join(" | "));
    await q.context().close();
  }
} catch (e) {
  ko("le test a planté : " + (e && e.message ? e.message.split("\n")[0] : e));
} finally { await nav.close(); serveur.close(); }

if (problemes.length) { console.error(`\n✗ ${problemes.length} problème(s) : ne pas publier cette version.`); process.exit(1); }
console.log("\n✓ Page OK");
