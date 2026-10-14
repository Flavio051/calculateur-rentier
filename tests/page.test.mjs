// Contrôle 2 : la page s'ouvre dans un vrai navigateur sans erreur, et ce qu'elle AFFICHE
// correspond au relevé Gui Storm (âge, capital, rentes, pension), sur ordinateur et sur mobile.
// Lancement : node tests/page.test.mjs   (nécessite « npm install » et Chromium pour Playwright)
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.error("✗ Playwright absent : lance « npm install » (puis « npx playwright install chromium » si besoin)."); process.exit(1); }

const html = readFileSync(path.join(racine, "index.html"), "utf8");
const ref = JSON.parse(readFileSync(path.join(racine, "tests", "reference-guistorm.json"), "utf8"));
const CLE = "calculateur-rentier-v3";
const problemes = [];
const ok = msg => console.log("  ✓ " + msg);
const ko = msg => { problemes.push(msg); console.log("  ✗ " + msg); };

// Chart.js : la page le charge depuis cdnjs ; le test sert la même version depuis node_modules (hors ligne, reproductible)
const CDN = html.match(/<script src="(https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/Chart\.js\/([\d.]+)\/chart\.umd\.min\.js)"/);
const dossierChart = path.join(racine, "node_modules", "chart.js");
let versionLocale, chartLocal;
try {
  versionLocale = JSON.parse(readFileSync(path.join(dossierChart, "package.json"), "utf8")).version;
  chartLocal = readFileSync(path.join(dossierChart, "dist", "chart.umd.js"), "utf8");
} catch { console.error("✗ Chart.js absent de node_modules : lance « npm install »."); process.exit(1); }

// Petit serveur local, comme GitHub Pages
const serveur = createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (url === "/" || url === "/index.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(r => serveur.listen(0, "127.0.0.1", r));
const adresse = `http://127.0.0.1:${serveur.address().port}/`;

const navigateur = await chromium.launch();
async function nouvellePage(largeur, hauteur, etatInitial) {
  const ctx = await navigateur.newContext({ viewport: { width: largeur, height: hauteur }, locale: "fr-FR" });
  const page = await ctx.newPage();
  page.erreurs = [];
  page.on("pageerror", e => page.erreurs.push(e.message));
  page.on("console", m => { if (m.type() === "error") page.erreurs.push(m.text()); });
  await page.route(/^https:\/\/cdnjs\.cloudflare\.com\//, route => route.fulfill({ status: 200, contentType: "application/javascript", body: chartLocal }));
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  if (etatInitial) await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [CLE, JSON.stringify(etatInitial)]);
  await page.goto(adresse);
  await page.waitForSelector(".hero-age .big");
  return page;
}
const num = s => (s == null ? null : +String(s).replace(/[^\d]/g, "") || 0);

// Lit ce que la page affiche, dans le même format que le relevé Gui Storm
async function lireAffichage(page) {
  return page.evaluate(() => {
    const t = s => document.querySelector(s)?.innerText ?? "";
    const big = t(".hero-age .big"), hero = t(".hero-age");
    const kpis = [...document.querySelectorAll(".kpi")].map(k => [k.querySelector(".v")?.innerText ?? "", k.querySelector(".s")?.innerText ?? ""]);
    const m = /^(\d+) ans$/.exec(big.trim());
    const pension = t("#pension");
    const pm = /tomberait à ([\d\s  ]+)/.exec(pension);
    const cr = /≈ ([\d\s  ]+)/.exec(kpis[0]?.[1] ?? "");
    return {
      age: m ? m[1] + (hero.includes("dès maintenant") ? "*" : "") : "—",
      capital: cr ? cr[1] : (kpis[0]?.[0] ?? null),
      brut: kpis[1]?.[0] ?? null,
      net: kpis[2]?.[0] ?? null,
      pension: pm ? pm[1] : null,
      texte: document.body.innerText,
    };
  });
}

try {
  console.log("Page dans un navigateur (Chromium)");

  // 0. Bonne version de Chart.js
  if (!CDN) ko("balise <script> Chart.js (cdnjs, version exacte) introuvable dans index.html");
  else if (CDN[2] !== versionLocale) ko(`Chart.js : la page charge ${CDN[2]} mais les tests utilisent ${versionLocale} (aligner package.json)`);
  else ok(`Chart.js ${versionLocale} (même version que la page)`);

  // 1. Première visite : réglages par défaut, comme Gui Storm (52 ans en simplifié, 45 ans en avancé)
  {
    const page = await nouvellePage(1280, 900);
    let a = await lireAffichage(page);
    a.age === "52" && num(a.capital) === 636623 ? ok("première visite, mode simplifié : 52 ans, 636 623 €") : ko(`première visite, mode simplifié : ${a.age} ans, ${a.capital} (attendu 52 ans, 636 623 €)`);
    const graphe = id => page.evaluate(i => !!(window.Chart && Chart.getChart(document.getElementById(i))), id);
    (await graphe("chart")) ? ok("graphique du capital dessiné") : ko("graphique du capital absent (Chart.js non chargé ou erreur de rendu)");
    await page.click("#tab-adv");
    await page.waitForTimeout(150);
    a = await lireAffichage(page);
    a.age === "45" && num(a.capital) === 529672 ? ok("mode avancé : 45 ans, 529 672 €") : ko(`mode avancé : ${a.age} ans, ${a.capital} (attendu 45 ans, 529 672 €)`);
    (await graphe("chart")) && (await graphe("chart-income")) ? ok("mode avancé : graphiques du capital et des revenus dessinés") : ko("mode avancé : un des deux graphiques manque");
    const lignesPays = await page.$$eval("#tbl tbody tr", l => l.length);
    lignesPays >= 10 ? ok(`tableau des pays : ${lignesPays} lignes`) : ko(`tableau des pays presque vide (${lignesPays} lignes)`);
    await page.click("#btn-cities");
    await page.waitForTimeout(150);
    const [lignesVilles, bouton] = await Promise.all([page.$$eval("#tbl tbody tr", l => l.length), page.innerText("#btn-cities")]);
    const annonce = num(bouton);
    lignesVilles === annonce && annonce > 100 ? ok(`mode villes : ${lignesVilles} lignes, comme annoncé sur le bouton`) : ko(`mode villes : ${lignesVilles} lignes pour « ${bouton} »`);
    // Le réglage est mémorisé : après rechargement on retrouve le mode avancé
    await page.reload(); await page.waitForSelector(".hero-age .big");
    a = await lireAffichage(page);
    a.age === "45" ? ok("réglages retrouvés après rechargement") : ko(`après rechargement : ${a.age} ans au lieu de 45 (sauvegarde cassée ?)`);
    page.erreurs.length ? ko("erreurs JavaScript : " + [...new Set(page.erreurs)].slice(0, 3).join(" | ")) : ok("aucune erreur JavaScript");
    await page.context().close();
  }

  // 2. Les 68 profils du relevé Gui Storm, lus à l'écran
  {
    const page = await nouvellePage(1280, 900);
    let bons = 0;
    const ecarts = [];
    for (const cas of ref.cas) {
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [CLE, JSON.stringify(cas.etat)]);
      await page.reload();
      await page.waitForSelector(".hero-age .big");
      const a = await lireAffichage(page);
      const lu = { age: a.age, capital: num(a.capital), brut: num(a.brut), net: num(a.net), pension: a.pension == null ? null : num(a.pension) };
      const connus = new Set(cas.ecartConnu?.champs || []);
      const diff = Object.entries(cas.attendu).filter(([c, v]) => v != null && lu[c] != null && lu[c] !== v && !connus.has(c)).map(([c, v]) => `${c} Gui Storm ${v} / page ${lu[c]}`);
      if (cas.attendu.pension != null && lu.pension == null && !connus.has("pension")) diff.push(`pension Gui Storm ${cas.attendu.pension} / page : non affichée`);
      if (/\bNaN\b|undefined|Infinity/.test(a.texte)) diff.push("texte « NaN / undefined / Infinity » affiché");
      if (diff.length) ecarts.push(`${cas.id} ${cas.nom} : ${diff.join(" ; ")}`); else bons++;
    }
    ecarts.length ? ko(`profils Gui Storm affichés : ${bons}/${ref.cas.length}\n      ` + ecarts.slice(0, 10).join("\n      ")) : ok(`profils Gui Storm affichés à l'écran : ${bons}/${ref.cas.length} identiques`);
    page.erreurs.length ? ko("erreurs JavaScript pendant les profils : " + [...new Set(page.erreurs)].slice(0, 3).join(" | ")) : ok("aucune erreur JavaScript sur les 68 profils");
    await page.context().close();
  }

  // 3. Mobile (375 px) : rien ne déborde sur le côté, en simplifié comme en avancé
  for (const mode of ["simple", "advanced"]) {
    const page = await nouvellePage(375, 812, { mode });
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    debord <= 1 ? ok(`mobile 375 px, mode ${mode === "simple" ? "simplifié" : "avancé"} : pas de défilement horizontal`) : ko(`mobile 375 px, mode ${mode} : la page déborde de ${debord} px`);
    if (page.erreurs.length) ko("erreurs JavaScript sur mobile : " + [...new Set(page.erreurs)].slice(0, 3).join(" | "));
    await page.context().close();
  }
} catch (e) {
  ko("le test de la page a planté : " + (e && e.message ? e.message.split("\n")[0] : e));
} finally {
  await navigateur.close();
  serveur.close();
}

if (problemes.length) { console.error(`\n✗ ${problemes.length} problème(s) sur la page : ne pas publier cette version.`); process.exit(1); }
console.log("\n✓ Page OK");
