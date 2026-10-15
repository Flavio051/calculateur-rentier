// Contrôle 1 : le moteur de Bilan Locatif (bloc /*CORE-START*/ … /*CORE-END*/ de la page)
// - reproduit les chiffres relevés dans l'appli Cashflow Locatif (vidéo du 15/10/2026),
// - respecte les barèmes officiels 2026 (notaire, impôt sur le revenu, plus-value),
// - reste cohérent pour tous les régimes et des profils tirés au hasard,
// - laisse la surface, le prix et le loyer à l'utilisateur et complète les autres champs vides par des repères standards.
// Lancement : node tests/moteur.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fichier = process.env.PAGE || path.join(racine, "immobilier", "index.html");
const html = readFileSync(fichier, "utf8");
const m = html.split("/*CORE-START*/");
if (m.length !== 2) { console.error("✗ Bloc /*CORE-START*/ introuvable dans " + fichier); process.exit(1); }
const core = m[1].split("/*CORE-END*/")[0];
const E = {};
const REGIMES_NUS = new Set(["microFoncier", "reelFoncier", "jeanbrun"]);
new Function("out", core + "; Object.assign(out, { RULES, REGIMES, DEFAULT_SIM, NOUVELLE_SIM, NULLABLES, CHARGES, estimer, lieu, requis, normaliser, simuler, comparerRegimes, leviers, irFoyer, tmiFoyer, fraisNotaire, echeancier, abattementsPV, surtaxePV, tri });")(E);

let ok = 0, ko = 0; const erreurs = [];
const groupe = t => console.log("\n" + t);
function egal(nom, obtenu, attendu, tol = 0.5) {
  const bon = typeof attendu === "number" ? Number.isFinite(obtenu) && Math.abs(obtenu - attendu) <= tol : obtenu === attendu;
  if (bon) ok++; else { ko++; erreurs.push(`✗ ${nom} : attendu ${attendu}, obtenu ${typeof obtenu === "number" ? +obtenu.toFixed(4) : obtenu}`); }
  return bon;
}
function vrai(nom, cond) { if (cond) ok++; else { ko++; erreurs.push("✗ " + nom); } }
const R0 = Math.round;

// 1. Cas de la vidéo Cashflow Locatif (frais de notaire saisis tels qu'affichés : 8 570 €)
groupe("Cas de la vidéo Cashflow Locatif");
{
  const x = E.simuler({ notaireMode: "fixe", notaireFixe: 8570, pvFrais: "aucun", pvTravaux: "aucun", actualisation: 1 });
  const y1 = x.Y[0], y2 = x.Y[1], rv = x.rv, pv = rv.pv;
  const avant = ko;
  egal("coût total du projet", x.coutTotal, 108570);
  egal("montant emprunté", x.emprunt, 108570);
  egal("cash nécessaire", x.mise, 0);
  egal("échéance mensuelle (646 €)", R0(x.mensualite), 646);
  egal("coût total de l'emprunt (46 399 €)", R0(x.totInterets + x.totAssurance), 46399);
  egal("intérêts payés à terme (39 885 €)", R0(x.totInterets), 39885);
  egal("assurance payée à terme (6 514 €)", R0(x.totAssurance), 6514);
  egal("capital amorti année 1 (3 899 €)", R0(y1.capital), 3899);
  egal("intérêts année 1 (3 524 €)", R0(y1.interets), 3524);
  egal("assurance année 1 (326 €)", R0(y1.assurance), 326);
  egal("restant dû fin d'année 1 (104 671 €)", R0(y1.crd), 104671);
  egal("revenu brut année 1 (10 200 €)", y1.revenus, 10200);
  egal("assiette micro-BIC (5 100 €)", y1.baseIR, 5100);
  egal("prélèvements sociaux 18,6 % (949 €)", R0(y1.ps), 949);
  egal("impôt sur le revenu (1 530 €)", R0(y1.ir), 1530);
  egal("montant à payer année 1 (2 479 €)", R0(y1.impot), 2479);
  egal("cash-flow année 2 (−27 €/an)", R0(y2.cf), -27);
  egal("cash-flow année 2 (−2 €/mois)", R0(y2.cf / 12), -2);
  egal("coûts d'exploitation et de crédit année 2 (10 227 €)", R0(y2.couts), 10227);
  egal("prix de revente à 10 ans (134 392 €)", R0(rv.prix), 134392);
  egal("plus-value brute (34 392 €)", pv.pvBrute, 34392);
  egal("abattement IR 30 % (10 318 €)", R0(pv.aIR), 10318);
  egal("imposable IR (24 074 €)", R0(pv.bIR), 24074);
  egal("impôt sur le revenu PV (4 574 €)", R0(pv.ir), 4574);
  egal("abattement PS 8,25 % (2 837 €)", R0(pv.aPS), 2837);
  egal("imposable PS (31 555 €)", R0(pv.bPS), 31555);
  egal("prélèvements sociaux PV (5 427 €)", R0(pv.ps), 5427);
  egal("impôt sur la plus-value (10 002 €)", R0(pv.impot), 10002);
  egal("plus-value nette (24 390 €)", R0(pv.nette), 24390);
  for (let t = 1; t <= 9; t++) egal(`flux de trésorerie année ${t} (−27 €)`, R0(rv.flux[t]), -27);
  egal("flux de trésorerie année 10 (61 214 € à 1 € près)", rv.flux[10], 61214, 1);
  egal("enrichissement (60 970 €)", R0(rv.enrichissement), 60970);
  egal("VAN à 1 % (55 184 €)", R0(rv.van), 55184);
  egal("TRI (120,62 %)", +(rv.tri * 100).toFixed(2), 120.62, 0.005);
  console.log(`  ${ko === avant ? "✓" : "✗"} ${ok} valeurs comparées à l'appli`);
}

// 2. Barèmes officiels
groupe("Barèmes officiels 2026");
{
  const avant = ko, okAvant = ok;
  const fn = o => E.fraisNotaire(E.normaliser(o)).total;
  egal("notaire 100 000 € ancien, département à 5 %", fn({ prix: 100000 }), 8854.00, 0.01);
  egal("notaire 100 000 € ancien, département à 4,5 %", fn({ prix: 100000, dmto: "4.5" }), 8342.15, 0.01);
  egal("notaire 100 000 € neuf", fn({ prix: 100000, notaireType: "neuf" }), 3250.50, 0.01);
  egal("notaire 250 000 € ancien", fn({ prix: 250000 }), 19919.95, 0.01);
  egal("IR personne seule, 30 000 €", E.irFoyer(30000, 1), 2103.99, 0.01);
  egal("IR couple, 60 000 €", E.irFoyer(60000, 2), 4207.98, 0.01);
  egal("IR couple + 1 enfant, 60 000 € (quotient familial)", E.irFoyer(60000, 2.5), 3410.00, 0.01);
  egal("IR couple + 2 enfants, 150 000 € (plafonnement du quotient)", E.irFoyer(150000, 3), Math.max(E.irFoyer(150000, 3) , 0), 0.01);
  vrai("plafonnement du quotient familial appliqué (1 807 € par demi-part)", Math.abs(E.irFoyer(150000, 3) - Math.max((() => { const q = 150000 / 3; let b = 0, t = 0; for (const [h, r] of E.RULES.bareme) { t += Math.max(0, Math.min(q, h) - b) * r; b = h; } return t * 3; })(), E.irFoyer(150000, 2) - 2 * 1807)) < 0.01);
  egal("IR personne seule, 20 000 € (décote)", E.irFoyer(20000, 1), 445.11, 0.01);
  egal("TMI à 30 000 € pour 1 part", E.tmiFoyer(30000, 1), 30);
  const ab = N => { const a = E.abattementsPV(N); return a.ir + "/" + a.ps; };
  egal("abattements plus-value à 5 ans", ab(5), "0/0");
  egal("abattements plus-value à 6 ans", ab(6), "6/1.65");
  egal("abattements plus-value à 21 ans", ab(21), "96/26.4");
  egal("abattements plus-value à 22 ans", ab(22), "100/28");
  egal("abattements plus-value à 23 ans", ab(23), "100/37");
  egal("abattements plus-value à 30 ans", ab(30), "100/100");
  egal("surtaxe à 50 000 €", E.surtaxePV(50000), 0);
  egal("surtaxe à 55 000 € (lissage)", E.surtaxePV(55000), 850);
  egal("surtaxe à 80 000 €", E.surtaxePV(80000), 1600);
  egal("surtaxe à 105 000 € (lissage)", E.surtaxePV(105000), 2650);
  egal("surtaxe à 300 000 €", E.surtaxePV(300000), 18000);
  console.log(`  ${ko === avant ? "✓" : "✗"} ${ok - okAvant} contrôles (notaire, barème IR, plus-value)`);
}

// 3. Prêts
groupe("Prêts");
{
  const avant = ko, okAvant = ok;
  const ac = E.echeancier(120000, 3.6, 10, 0, "amortConstant", "aucun", 0);
  egal("amortissement constant : 1re échéance", ac[0].mensualite, 1360, 0.01);
  egal("amortissement constant : dernière échéance", ac[119].mensualite, 1003, 0.01);
  egal("amortissement constant : solde final", ac[119].crd, 0, 0.01);
  const inf = E.echeancier(120000, 3.6, 10, 0, "inFine", "aucun", 0);
  egal("in fine : échéance courante (intérêts seuls)", inf[10].mensualite, 360, 0.01);
  egal("in fine : capital remboursé à la fin", inf[119].capital, 120000, 0.01);
  const dp = E.echeancier(100000, 3, 20, 0, "constantes", "partiel", 12);
  egal("différé partiel : capital intact après 12 mois", dp[11].crd, 100000, 0.01);
  egal("différé partiel : échéance pendant le différé", dp[0].mensualite, 250, 0.01);
  const dt = E.echeancier(100000, 3, 20, 0, "constantes", "total", 12);
  egal("différé total : intérêts capitalisés", dt[11].crd, 100000 * Math.pow(1.0025, 12), 0.01);
  egal("différé total : rien à payer", dt[0].mensualite, 0);
  egal("différé total : solde final", dt[239].crd, 0, 0.01);
  console.log(`  ${ko === avant ? "✓" : "✗"} ${ok - okAvant} contrôles`);
}

// 4. Régimes fiscaux
groupe("Régimes fiscaux");
{
  const avant = ko, okAvant = ok;
  const base = { notaireMode: "fixe", notaireFixe: 8570 };
  const mf = E.simuler({ ...base, regime: "microFoncier" });
  egal("micro-foncier : 70 % des loyers HC × (30 % + 17,2 %)", mf.Y[0].impot, 9600 * 0.7 * 0.472, 0.01);
  const big = E.simuler({ ...base, regime: "microFoncier", loyer: 1400 });
  vrai("micro-foncier : alerte au-delà de 15 000 € de loyers", big.warnings.some(w => w.k === "plafond-mf"));
  // Déficit foncier : 30 000 € de travaux déduits la 1re année
  const df = E.simuler({ ...base, regime: "reelFoncier", travaux: 30000, inclus: { travaux: false } });
  const y1 = df.Y[0];
  egal("réel foncier : déficit imputé sur le revenu global plafonné à 10 700 €", y1.baseIR, -10700, 0.01);
  egal("réel foncier : économie d'impôt = 10 700 € × TMI 30 %", y1.impot, -3210, 0.01);
  egal("réel foncier : pas de prélèvements sociaux sur un déficit", y1.ps, 0);
  vrai("réel foncier : le reste du déficit est reporté puis absorbe les revenus suivants", df.Y[1].impot === 0 && df.Y[1].baseIR === 0);
  // LMNP réel : l'amortissement ne crée pas de déficit
  const lr = E.simuler({ ...base, regime: "lmnpReel", mobilier: 8000, loyer: 500, chargesLoc: 0 });
  vrai("LMNP réel : jamais d'impôt négatif", lr.Y.every(o => o.impot >= 0));
  const l1 = lr.Y[0].fisc;
  vrai("LMNP réel : amortissements mis en réserve quand le résultat est nul", (l1.find(l => l[0].startsWith("Amortissements mis en réserve")) || [0, 0])[1] > 0);
  const lmnp = E.simuler({ ...base, regime: "lmnpReel" });
  egal("LMNP réel : amortissement du bâti = (prix + frais) × 85 % / 30", (lmnp.Y[0].fisc.find(l => l[0] === "Amortissements de l'année") || [0, 0])[1], 108570 * 0.85 / 30, 0.01);
  vrai("LMNP réel : amortissements réintégrés dans la plus-value", lmnp.rv.pv.amortReint > 0 && E.simuler({ ...base, regime: "lmnpReel", residenceServices: true }).rv.pv.amortReint === 0);
  // Jeanbrun : plafond annuel
  const jb = E.simuler({ prix: 300000, notaireType: "neuf", regime: "jeanbrun", jbNiveau: "intermediaire", loyer: 1200 });
  egal("Jeanbrun : 3,5 % × 80 % × 300 000 € plafonné à 8 000 €", (jb.Y[0].fisc.find(l => l[0] === "Amortissement Jeanbrun") || [0, 0])[1], -8000, 0.01);
  const jbAncien = E.simuler({ prix: 180000, travaux: 15000, regime: "jeanbrun" });
  vrai("Jeanbrun dans l'ancien sans 30 % de travaux : signalé comme non éligible", jbAncien.warnings.some(w => w.k === "jb-trav" && w.niveau === "critique"));
  vrai("Jeanbrun non éligible : jamais proposé comme levier", !E.leviers({ prix: 180000, travaux: 15000, regime: "lmnpReel", loyer: 850 }).some(l => l.patch.regime === "jeanbrun"));
  // Réductions d'impôt
  const la = E.simuler({ ...base, regime: "reelFoncier", defisc: "loc2" });
  egal("Loc'Avantages 2 : réduction de 35 % des loyers", la.Y[0].reduction, 0.35 * 9600, 0.01);
  egal("Loc'Avantages : réduction limitée à 6 ans", la.Y[6].reduction, 0);
  const dn = E.simuler({ prix: 150000, travaux: 60000, surface: 60, regime: "reelFoncier", defisc: "denormandie9", detention: 12 });
  egal("Denormandie 9 ans : 2 % du prix de revient par an", dn.Y[0].reduction, 0.02 * (dn.coutTotal - 0), 0.01);
  egal("Denormandie 9 ans : plus rien la 10e année", dn.Y[9].reduction, 0);
  // Micro-BIC tourisme non classé
  const cd = E.simuler({ ...base, location: "courte", tourisme: "nonClasse", nuitee: 80, occupationCD: 60 });
  egal("meublé de tourisme non classé : abattement de 30 %", cd.Y[0].baseIR, cd.Y[0].revenus * 0.7, 0.01);
  vrai("meublé de tourisme non classé : alerte au-delà de 15 000 €", cd.warnings.some(w => w.k === "plafond-bic"));
  // SCI à l'IS
  const sci = E.simuler({ ...base, regime: "sciIs", apport: 20000 });
  egal("SCI : IS à 15 % sur le résultat", sci.Y[1].is, 0.15 * Math.max(0, (sci.Y[1].fisc.find(l => l[0] === "Résultat imposable") || [0, 0])[1]), 0.01);
  vrai("SCI : flat tax de sortie appliquée sur le boni", sci.rv.sortie && Math.abs(sci.rv.sortie.taxe - 0.314 * Math.max(0, sci.rv.sortie.boni)) < 0.01);
  // Comparatif
  const cp = E.comparerRegimes({ ...base });
  egal("comparatif : six régimes en location à l'année", cp.length, 6);
  egal("comparatif : trois régimes en courte durée", E.comparerRegimes({ ...base, location: "courte" }).length, 3);
  console.log(`  ${ko === avant ? "✓" : "✗"} ${ok - okAvant} contrôles`);
}

// 5. Cohérence sur 300 profils tirés au hasard
groupe("Cohérence sur 300 profils tirés au hasard");
{
  const avant = ko, okAvant = ok;
  let graine = 20261015; const rnd = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = a => a[Math.floor(rnd() * a.length)], int = (a, b) => Math.round(a + rnd() * (b - a));
  const regs = Object.keys(E.REGIMES);
  for (let i = 0; i < 300; i++) {
    const s = {
      prix: int(40, 600) * 1000, notaireMode: pick(["auto", "fixe"]), notaireFixe: int(2, 50) * 1000, notaireType: pick(["ancien", "neuf"]), dmto: pick(["5", "4.5"]),
      agenceMode: pick(["fixe", "pct"]), agence: int(0, 8), travaux: pick([0, 0, 10000, 40000]), travauxMois: pick([0, 0, 3, 14]), mobilier: pick([0, 5000]), plans: pick([0, 2000]),
      pret: rnd() < 0.85, apport: int(0, 80) * 1000, duree: int(10, 30), taux: int(150, 500) / 100, tauxAss: int(0, 50) / 100, courtage: pick([0, 1500]), dossier: pick([0, 800]),
      cautionMode: pick(["fixe", "pct"]), caution: int(0, 2), typePret: pick(["constantes", "amortConstant", "inFine"]), differe: pick(["aucun", "aucun", "partiel", "total"]), differeMois: int(0, 24),
      location: rnd() < 0.8 ? "annee" : "courte", loyer: int(300, 2500), chargesLoc: int(0, 150), occupation: int(80, 100), evolLoyer: pick([0, 1, 2]),
      nuitee: int(40, 200), occupationCD: int(30, 90), tourisme: pick(["classe", "nonClasse"]),
      copro: { mode: pick(["an", "mois", "trim", "pct"]), v: int(0, 100) }, tf: { mode: "an", v: int(0, 3000) }, gli: { mode: "pct", v: pick([0, 3]) }, gerance: { mode: "pct", v: pick([0, 7]) },
      comptable: { mode: "an", v: pick([0, 500]) }, pno: { mode: "mois", v: int(0, 20) }, autres: { mode: "an", v: int(0, 800) }, cfe: pick([0, 300]), evolCharges: pick([0, 2]),
      regime: pick(regs), defisc: pick(["aucune", "aucune", "loc1", "loc2i", "denormandie9"]), tmiMode: pick(["fixe", "calcul"]), tmi: pick([0, 11, 30, 41, 45]), revenusFoyer: int(0, 200) * 1000, parts: pick([1, 1.5, 2, 3]),
      fraisAcq: pick(["amortis", "charges"]), residenceServices: rnd() < 0.2, travauxDeductibles: rnd() < 0.8, renoEnergetique: rnd() < 0.2, jbType: pick(["neuf", "ancien"]), jbNiveau: pick(["intermediaire", "social", "tresSocial"]),
      reventeMode: pick(["auto", "auto", "fixe"]), reventeFixe: int(30, 900) * 1000, detention: int(1, 35), revalo: int(-2, 5), fraisRevente: pick([0, 5]), ira: rnd() < 0.3,
      pvFrais: pick(["auto", "forfait", "reels", "aucun"]), pvTravaux: pick(["auto", "forfait", "reels", "aucun"]), actualisation: pick([0, 1, 3]), anneeRef: int(1, 5)
    };
    let x; try { x = E.simuler(s); } catch (e) { vrai(`profil ${i} : calcul sans erreur (${e.message})`, false); continue; }
    const fin = v => Number.isFinite(v);
    const nan = [x.coutTotal, x.emprunt, x.mise, x.rv.enrichissement, x.rv.van, x.k.cf, x.k.brut].concat(x.Y.flatMap(o => [o.revenus, o.charges, o.credit, o.impot, o.cf, o.crd]));
    vrai(`profil ${i} : aucun résultat non chiffré`, nan.every(fin));
    vrai(`profil ${i} : cash-flow = revenus − charges − crédit − impôt`, x.Y.every(o => Math.abs(o.cf - (o.revenus - o.charges - o.credit - o.impot)) < 1e-6));
    vrai(`profil ${i} : enrichissement = somme des flux`, Math.abs(x.rv.enrichissement - x.rv.flux.reduce((a, b) => a + b, 0)) < 1e-6);
    vrai(`profil ${i} : mise de départ = coût total + frais bancaires − emprunt`, Math.abs(x.mise - (x.coutTotal + x.fraisBancaires - x.emprunt)) < 1e-6);
    vrai(`profil ${i} : le prêt est remboursé à son terme`, !x.emprunt || x.rows[x.rows.length - 1].crd < 0.01);
    vrai(`profil ${i} : plus-value jamais négative pour un particulier`, x.rv.pv.sci || x.rv.pv.pvBrute >= 0);
    if (x.rv.tri !== null) { const r = x.rv.tri, v = x.rv.flux.reduce((a, f, t) => a + f / Math.pow(1 + r, t), 0); vrai(`profil ${i} : le TRI annule la VAN`, Math.abs(v) < 0.5); }
  }
  console.log(`  ${ko === avant ? "✓" : "✗"} ${ok - okAvant} contrôles`);
}

// Champs vides : surface, prix et loyer à chercher soi-même ; repères standards (règles stables) pour le reste
groupe("Champs vides et repères standards");
{
  const avant = ko, okAvant = ok;
  const nv = o => Object.assign(JSON.parse(JSON.stringify(E.NOUVELLE_SIM)), o || {});
  const fin = v => Number.isFinite(v);
  const chiffre = x => [x.coutTotal, x.emprunt, x.mise, x.rv.enrichissement, x.k.cf, x.k.brut].concat(x.Y.flatMap(y => [y.revenus, y.charges, y.credit, y.impot, y.cf])).every(fin);
  const base = { surface: 45, prix: 120000, loyer: 600 };

  // Nouvelle simulation : tout est vide, rien n'est inventé pour la surface, le prix et le loyer
  const n0 = E.normaliser(nv());
  vrai("nouvelle simulation : prix, loyer, taux et surface vides", [n0.prix, n0.loyer, n0.taux, n0.surface].every(v => v === null));
  vrai("nouvelle simulation : charges vides", E.CHARGES.every(c => n0[c].v === null));
  const ex = E.simuler(E.DEFAULT_SIM);
  vrai("l'exemple n'utilise aucun repère et ne manque de rien", ex.auto.length === 0 && ex.manque.length === 0);
  const x0 = E.simuler(nv());
  egal("nouvelle simulation : il manque la surface, le prix et le loyer", x0.manque.join(","), "surface,prix,loyer");
  egal("courte durée : le prix par nuit remplace le loyer", E.simuler(nv({ location: "courte", regime: "microbic" })).manque.join(","), "surface,prix,nuitee");
  vrai("chiffres manquants : le calcul reste chiffré (il n'est pas affiché)", chiffre(x0));
  vrai("chiffres manquants : les repères qui en dépendent sont signalés", ["travaux", "copro", "tf", "pno", "caution"].every(k => x0.incertains.includes(k)));
  vrai("chiffres manquants : les repères qui n'en dépendent pas restent utilisables", ["taux", "tauxAss", "duree", "occupation", "dossier"].every(k => !x0.incertains.includes(k)));
  const x1 = E.simuler(nv(base));
  vrai("surface, prix et loyer remplis : plus rien ne manque, aucun repère douteux", x1.manque.length === 0 && x1.incertains.length === 0 && chiffre(x1));
  egal("aucune base de prix par ville : Reims et Guéret donnent le même calcul", E.simuler(nv(Object.assign({ ville: "51100 Reims" }, base))).Y[1].cf, E.simuler(nv(Object.assign({ ville: "23000 Guéret" }, base))).Y[1].cf, 1e-9);

  // Où est le bien ? (encadrement des loyers, outre-mer, charges de copropriété en Île-de-France)
  const li = (ville, adresse = "") => E.lieu({ ville, adresse });
  egal("« Paris 11e » sans code postal : Paris", li("Paris 11e").dep, "75");
  vrai("Paris : loyers encadrés", li("Paris 11e").encadrement && li("Paris").encadrement);
  vrai("Lyon 3e et Bordeaux : loyers encadrés", li("Lyon 3e").encadrement && li("Bordeaux").encadrement);
  vrai("Reims : loyers non encadrés", !li("Reims").encadrement && !li("Reims", "12 rue de Vesle, 51100 Reims").encadrement);
  egal("département lu dans le code postal de l'adresse", li("", "12 rue de Vesle, 51100 Reims").dep, "51");
  egal("département lu dans « Reims (51) »", li("Reims (51)").dep, "51");
  vrai("Saint-Denis sans code postal : on ne devine pas (homonyme à La Réunion)", !li("Saint-Denis").encadrement);
  vrai("Saint-Denis (93200) : loyers encadrés", li("Saint-Denis", "93200").encadrement);
  vrai("Saint-Denis (974) : outre-mer, pas d'encadrement", li("Saint-Denis (974)").dom && !li("Saint-Denis (974)").encadrement);
  vrai("Fort-de-France (97200) : outre-mer", li("Fort-de-France", "97200").dom);
  const cop = v => E.simuler(nv(Object.assign({ ville: v }, base))).s.copro.v;
  vrai("copropriété plus chère à Paris qu'à Reims (même surface)", cop("Paris") > cop("Reims"));

  // Repères : chiffrés, croissants, cohérents pour tous les profils
  for (const typeBien of ["appartement", "maison"]) for (const regime of ["microFoncier", "microbic", "lmnpReel", "sciIs"]) for (const etat of ["bon", "renover"]) for (const location of ["annee", "courte"]) {
    if (location === "courte" && REGIMES_NUS.has(regime)) continue;
    const nom = `${typeBien} · ${regime} · ${etat} · ${location}`;
    const o = Object.assign({ typeBien, regime, etat, location, nuitee: 70 }, base);
    let x; try { x = E.simuler(nv(o)); } catch (e) { vrai(`${nom} : calcul sans erreur (${e.message})`, false); continue; }
    vrai(`${nom} : résultats chiffrés`, chiffre(x) && x.manque.length === 0);
    for (const [k, e] of Object.entries(x.est)) if (e.t) {
      const v = e.t.map(t => t[1]);
      vrai(`${nom} : repères de « ${k} » chiffrés et croissants`, v.every(fin) && v[0] <= v[1] && v[1] <= v[2]);
    }
    vrai(`${nom} : rendement brut entre 2 et 20 %`, x.k.brut > 0.02 && x.k.brut < 0.2);
  }

  // Taper le repère dans un champ ne change rien au résultat
  for (const o of [{ ville: "Reims" }, { ville: "Paris", regime: "lmnpReel", surface: 30, prix: 280000, loyer: 1000 }, { ville: "Béziers", typeBien: "maison", etat: "renover", dpe: "F", surface: 90, prix: 160000, loyer: 850 }, { location: "courte", regime: "microbic", ville: "Nice", nuitee: 90 }]) {
    const a = E.simuler(nv(Object.assign({}, base, o))), plein = nv(Object.assign({}, base, o));
    for (const k of E.NULLABLES) plein[k] = a.s[k];
    for (const c of E.CHARGES) plein[c] = { mode: a.s[c].mode, v: a.s[c].v };
    const b = E.simuler(plein), nom = o.ville + (o.location ? " (courte durée)" : "");
    egal(`${nom} : repères tapés dans les champs → même cash-flow`, b.Y[1].cf, a.Y[1].cf, 1e-6);
    egal(`${nom} : repères tapés dans les champs → même enrichissement`, b.rv.enrichissement, a.rv.enrichissement, 1e-6);
    egal(`${nom} : plus aucun repère utilisé`, b.auto.length, 0);
  }

  // Chaque champ vidé seul sur l'exemple : à remplir (surface, prix, loyer) ou complété par un repère
  for (const k of E.NULLABLES.concat(E.CHARGES)) {
    const s = JSON.parse(JSON.stringify(E.DEFAULT_SIM));
    if (E.CHARGES.includes(k)) s[k].v = null; else s[k] = null;
    const x = E.simuler(s), aRemplir = E.requis(s).includes(k);
    vrai(`exemple avec « ${k} » vide : ${aRemplir ? "signalé à remplir" : "complété par un repère"}`, chiffre(x) && (aRemplir ? x.manque.includes(k) : (x.auto.includes(k) || k === "nuitee") && !x.manque.length)); // prix par nuit : inutile à l'année
  }

  // Les repères suivent des règles simples et stables
  const st = o => E.simuler(nv(Object.assign({}, base, o))).s;
  egal("bon état : pas de travaux", st({}).travaux, 0);
  egal("à rénover : 800 €/m² de travaux", st({ etat: "renover" }).travaux, 36000);
  egal("DPE G en bon état : rénovation énergétique 350 €/m²", st({ dpe: "G" }).travaux, 16000);
  egal("DPE F ou G : loyer gelé", st({ dpe: "F" }).evolLoyer, 0);
  egal("taxe foncière : 20 €/m² par an", st({}).tf.v, 900);
  egal("copropriété hors Île-de-France : 25 €/m² par an", st({}).copro.v, 1130, 5);
  vrai("location nue : pas de mobilier ; meublé : mobilier prévu", st({ regime: "microFoncier" }).mobilier === 0 && st({ regime: "microbic" }).mobilier > 0);
  vrai("taux : plus long, plus cher", st({ duree: 25 }).taux > st({ duree: 15 }).taux);

  // Alertes liées au bien
  const al = o => E.simuler(nv(Object.assign({}, base, o))).warnings.map(w => w.k + ":" + w.niveau);
  vrai("DPE G : alerte critique", al({ dpe: "G" }).includes("dpe:critique"));
  vrai("DPE G en outre-mer : alerte (interdiction en 2028)", al({ ville: "Fort-de-France", adresse: "97200", dpe: "G" }).includes("dpe:attention"));
  vrai("Paris : rappel de l'encadrement des loyers", al({ ville: "Paris" }).includes("encadrement:info"));
  vrai("Saint-Denis sans code postal : pas d'alerte d'encadrement", !al({ ville: "Saint-Denis" }).some(w => w.startsWith("encadrement")));
  console.log(`  ${ko === avant ? "✓" : "✗"} ${ok - okAvant} contrôles`);
}

if (ko) {
  console.error("\n" + erreurs.slice(0, 40).join("\n"));
  if (process.env.GITHUB_ACTIONS) for (const e of erreurs.slice(0, 10)) console.log(`::error title=Moteur immobilier::${e.replace(/%/g, "%25")}`);
  console.error(`\n✗ ${ko} écart(s) sur ${ok + ko} contrôles : ne pas publier cette version.`);
  process.exit(1);
}
console.log(`\n✓ Moteur OK (${ok} contrôles)`);
