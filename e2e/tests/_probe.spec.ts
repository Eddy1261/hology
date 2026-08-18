import { test } from "@playwright/test";
import { seedSession, unique, apiCreateProject, apiActivateProject, apiTouchSession } from "../helpers";

test("probe page state", async ({ page }) => {
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("CONSOLE", m.type(), m.text().slice(0, 300)); });
  page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 500)));
  page.on("response", (r) => { if (r.status() >= 400) console.log("HTTP", r.status(), r.url().slice(0, 120)); });
  const pid = unique("proj");
  await apiCreateProject(pid, "Probe Proj");
  await apiActivateProject(pid);
  await apiTouchSession("deepseek");
  await seedSession(page, unique("probe") + "@e2e.local");
  await page.goto("/app");
  await page.waitForTimeout(1500);
  console.log("URL1:", page.url());
  console.log("H1S:", await page.locator("h1").allTextContents());
  console.log("DASH-H1:", await page.evaluate(() => {
    const h = [...document.querySelectorAll("h1")].find((e) => e.textContent.includes("Your AI"));
    const s = getComputedStyle(h);
    return `font=${s.fontSize}/${s.lineHeight} fam=${s.fontFamily.slice(0, 30)} h=${s.height} vis=${s.visibility} op=${s.opacity} pos=${s.position} overflow=${s.overflow}`;
  }));
  await page.goto("/app/sessions");
  await page.waitForTimeout(1500);
  console.log("URL2:", page.url());
  console.log("H1S2:", await page.locator("h1").allTextContents());
  console.log("STYLES:", await page.evaluate(() => document.styleSheets.length));
  console.log("H1VIS:", await page.locator("h1").first().evaluate((el) => {
    const s = getComputedStyle(el);
    return `${s.display} ${s.visibility} ${s.opacity} ${el.getBoundingClientRect().width}x${el.getBoundingClientRect().height}`;
  }));
  console.log("HEIGHTS:", await page.evaluate(() => {
    const q = (el) => el ? `${el.className.slice(0, 40)} h=${el.getBoundingClientRect().height} ch=${getComputedStyle(el).height}` : "none";
    return `vw=${innerHeight} html=${q(document.documentElement)} body=${q(document.body)} root=${q(document.getElementById("root"))}`;
  }));
  console.log("PANEL:", await page.evaluate(() => {
    const p = document.querySelector(".ac-panel");
    const r = p?.getBoundingClientRect();
    return r ? `h=${r.height} w=${r.width}` : "none";
  }));
  console.log("SHELLCHILD:", await page.evaluate(() => {
    const p = document.querySelector(".ac-panel");
    const c = p?.firstElementChild;
    const r = c?.getBoundingClientRect();
    return c ? `${c.className.slice(0, 40)} h=${r.height} ch=${getComputedStyle(c).height}` : "none";
  }));
  console.log("TEXTCONTENT:", (await page.evaluate(() => document.body.textContent)).slice(0, 300).replace(/\s+/g, " "));
  console.log("ROOTHTML:", (await page.locator("#root").innerHTML()).slice(0, 200));
  console.log("BODYTXT:", (await page.locator("body").innerText()).slice(0, 500).replace(/\n+/g, " | "));
});
