// Navigation sur le site public de la LNB (calendrier Élite 2 → Match Center), comme un visiteur.
import puppeteer from "puppeteer";

export const CAL = "https://lnb.fr/fr/calendar/elite2?did=2&abbrev=PROB&yid=2026&cid=318";
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=fr-FR"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  await page.setExtraHTTPHeaders({ "Accept-Language": "fr-FR,fr;q=0.9" });
  return { browser, page };
}

/** Ouvre le calendrier Élite 2, sur une journée donnée si `journee` est fourni. Renvoie le texte de la page. */
export async function openCalendar(page, journee) {
  await page.goto(CAL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /tout rejeter/i.test(x.innerText)); if (b) b.click(); }).catch(() => {});
  await page.waitForFunction(() => /^(LUNDI|MARDI|MERCREDI|JEUDI|VENDREDI|SAMEDI|DIMANCHE) \d+ /m.test(document.body.innerText), { timeout: 45000, polling: 500 });
  if (journee) {
    const ok = await page.evaluate(async j => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const dd = [...document.querySelectorAll(".select-dropdown-btn")].find(e => /^(JOURN[ÉE]E|J\d+)$/i.test(e.innerText.trim().split("\n")[0]));
      if (!dd) return false;
      (dd.querySelector("button") || dd).click(); await sleep(500);
      const it = [...dd.querySelectorAll("li,button,[role=option]")].find(e => e.innerText.trim() === "J" + j);
      if (!it) return false; it.click(); return true;
    }, journee);
    if (!ok) throw new Error(`Journée J${journee} introuvable dans le calendrier`);
    // attendre que la liste affichée corresponde à la journée choisie
    await page.waitForFunction(j => {
      const L = document.body.innerText.split("\n").map(x => x.trim()).filter(Boolean);
      const d = L.findIndex(x => /^(LUNDI|MARDI|MERCREDI|JEUDI|VENDREDI|SAMEDI|DIMANCHE) \d+ /i.test(x)); if (d < 0) return false;
      const first = L.slice(d).find(x => /^J\d{1,2}$/.test(x)); return first === "J" + j;
    }, { timeout: 30000, polling: 500 }, journee);
    await sleep(1200);
  }
  return page.evaluate(() => document.body.innerText);
}

/** Clique sur la carte du match (équipe à domicile + extérieur) puis attend le Match Center. */
export async function openGame(page, journee, home, away) {
  await openCalendar(page, journee);
  const clicked = await page.evaluate((home, away) => {
    const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
    const H = norm(home), A = norm(away);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      if (norm(n.textContent) !== H || n.parentElement.closest(".slick-slide")) continue;
      let c = n.parentElement;
      for (let i = 0; i < 10 && c; i++, c = c.parentElement) { const t = norm(c.innerText); if (t.split("\n").length > 14) break; if (t.includes(A)) { n.parentElement.click(); return true; } }
    }
    return false;
  }, home, away);
  if (!clicked) throw new Error(`Match ${home} – ${away} introuvable (J${journee})`);
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => /^boxscore$/i.test(b.innerText.trim())), { timeout: 30000, polling: 300 });
  await sleep(500);
}

async function clickTab(page, label) {
  const ok = await page.evaluate(l => { const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim().toLowerCase() === l); if (b) { b.click(); return true; } return false; }, label);
  if (!ok) throw new Error(`Onglet ${label} absent`);
}
/** Lit le Boxscore (texte) */
export async function readBox(page) {
  await clickTab(page, "boxscore");
  await page.waitForFunction(() => (document.body.innerText.match(/^#$/gm) || []).length >= 2, { timeout: 15000, polling: 400 }).catch(() => {});
  await sleep(500);
  return page.evaluate(() => document.body.innerText);
}
/** Lit le Play by play (texte) */
export async function readPbp(page) {
  await clickTab(page, "play by play");
  await page.waitForFunction(() => /^(Q|P|OT)\d+ \d{1,2}:\d\d$/m.test(document.body.innerText) || /Aucune|Pas de donn/i.test(document.body.innerText), { timeout: 15000, polling: 400 }).catch(() => {});
  await sleep(800);
  return page.evaluate(() => document.body.innerText);
}
