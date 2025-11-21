const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const { proxyConfig, getSiteName } = require("./config");
const { loadSettings } = require("./settings");
const { loadAccounts } = require("./accountManager");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DB_WAKDA_PATH = "./database/wakda.json";

async function scrapeWakdaIDs() {
  console.clear();
  console.log(
    chalk.bgCyan.black.bold(" 🕵️  INTELLIGENCE MODE: AUTO-SYNC WAKDA ")
  );
  console.log(chalk.dim("Mencari ID Wakda & Menyimpan ke Database..."));

  const accounts = loadAccounts();
  if (accounts.length === 0) {
    console.log(chalk.red("❌ Butuh minimal 1 akun untuk login."));
    return;
  }
  const botAccount = accounts[0];
  const sessionFile = `./session/${botAccount.email}.json`;

  if (!fs.existsSync(sessionFile)) {
    console.log(chalk.red("❌ Sesi hilang. Login dulu di Menu 1."));
    return;
  }

  // Load Database Wakda Lama (Supaya gak ketimpa kosong)
  let wakdaDb = {};
  if (fs.existsSync(DB_WAKDA_PATH)) {
    try {
      wakdaDb = JSON.parse(fs.readFileSync(DB_WAKDA_PATH, "utf-8"));
    } catch (e) {
      wakdaDb = {};
    }
  }

  const settings = loadSettings();
  const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));

  const browser = await chromium.launch({
    headless: settings.headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const contextOptions = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    extraHTTPHeaders: {
      Referer: "https://antrean.logammulia.com/users",
      Origin: "https://antrean.logammulia.com",
    },
  };
  if (settings.useProxy) contextOptions.proxy = proxyConfig;

  const context = await browser.newContext(contextOptions);
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    console.log(chalk.cyan("🔄 Masuk ke Dashboard..."));
    await page.goto("https://antrean.logammulia.com/antrean", {
      waitUntil: "domcontentloaded",
    });

    if (page.url().includes("login")) {
      console.log(chalk.red("❌ Sesi Expired."));
      await browser.close();
      return;
    }

    console.log(chalk.yellow(`⏳ Mengambil list cabang...`));
    const options = await page.$$eval("select#site option", (opts) =>
      opts
        .map((o) => ({ id: o.value, text: o.innerText }))
        .filter((o) => o.id !== "")
    );

    console.log(chalk.green("\n✅ Mulai Scanning & Sync Database...\n"));
    console.log(
      "-------------------------------------------------------------"
    );
    console.log(
      "| ID  | CABANG                     | STATUS UPDATE          |"
    );
    console.log(
      "-------------------------------------------------------------"
    );

    let updateCount = 0;

    for (const opt of options) {
      const siteId = opt.id;
      const siteName = getSiteName(siteId)
        .replace("Butik Emas LM - ", "")
        .substring(0, 25);

      // 1. Ambil Token URL untuk cabang ini
      await page.selectOption("select#site", siteId);
      await page.waitForTimeout(200);
      const token = await page.inputValue("input#t");

      if (!token) continue;

      const url = `https://antrean.logammulia.com/antrean?site=${siteId}&t=${token}`;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });

        if (!page.url().includes("site=")) {
          console.log(
            `| ${siteId.padEnd(3)} | ${siteName.padEnd(26)} | ${chalk.red(
              "SKIP (Redirect)"
            )}        |`
          );
          await page.goto("https://antrean.logammulia.com/antrean");
          continue;
        }

        // 2. SCRAPE WAKDA
        // Cek dropdown
        let wakdaIds = await page.evaluate(() => {
          const select = document.querySelector("select#wakda");
          if (!select) return null;
          return Array.from(select.options)
            .map((o) => o.value)
            .filter((v) => v !== "");
        });

        // Fallback regex jika dropdown kosong
        if (!wakdaIds || wakdaIds.length === 0) {
          const content = await page.content();
          const selectMatch = content.match(
            /<select[^>]*id="wakda"[^>]*>([\s\S]*?)<\/select>/
          );
          if (selectMatch && selectMatch[1]) {
            const regex = /value="(\d+)"/g;
            wakdaIds = [...selectMatch[1].matchAll(regex)]
              .map((m) => m[1])
              .filter((v) => v !== "");
          }
        }

        // 3. SIMPAN KE DATABASE
        if (wakdaIds && wakdaIds.length > 0) {
          wakdaDb[siteId] = wakdaIds; // Update DB Memory
          updateCount++;
          console.log(
            `| ${siteId.padEnd(3)} | ${siteName.padEnd(
              26
            )} | ${chalk.greenBright("UPDATED: " + JSON.stringify(wakdaIds))} |`
          );
        } else {
          // Jangan hapus data lama jika sekarang kosong, biarkan yg lama
          const oldData = wakdaDb[siteId]
            ? JSON.stringify(wakdaDb[siteId])
            : "KOSONG";
          console.log(
            `| ${siteId.padEnd(3)} | ${siteName.padEnd(26)} | ${chalk.gray(
              "NO CHANGE (" + oldData + ")"
            )} |`
          );
        }
      } catch (e) {
        console.log(
          `| ${siteId.padEnd(3)} | ${siteName.padEnd(26)} | ${chalk.red(
            "ERROR"
          )}                  |`
        );
      }

      await delay(500);
    }
    console.log(
      "-------------------------------------------------------------"
    );

    // 4. TULIS KE FILE JSON
    fs.writeFileSync(DB_WAKDA_PATH, JSON.stringify(wakdaDb, null, 2));
    console.log(
      chalk.bgGreen.black(
        ` \n✅ DATABASE SAVED! ${updateCount} Cabang diperbarui di database/wakda.json \n`
      )
    );
  } catch (e) {
    console.log(chalk.red(`CRASH: ${e.message}`));
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeWakdaIDs };
