const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const Table = require("cli-table3");
const { proxyConfig, getSiteName } = require("../../config/config");
const { loadSettings } = require("../data/settings");
const { loadAccounts } = require("../data/accountManager");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DB_WAKDA_PATH = "./database/wakda.json";

async function scrapeWakdaIDs() {
  console.clear();
  console.log(
    chalk.bgCyan.black.bold(" 🕵️  INTELLIGENCE MODE: SLOW & STEADY ")
  );
  console.log(chalk.dim("Mencari ID Wakda dengan mode lambat (Anti-Ban)..."));

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

  const table = new Table({
    head: [
      chalk.white.bold("ID"),
      chalk.white.bold("CABANG"),
      chalk.white.bold("WAKDA ID"),
      chalk.white.bold("STATUS"),
    ],
    colWidths: [6, 30, 35, 15],
    wordWrap: true,
  });

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

  // Gunakan Headless TRUE biar lebih ringan dan cepat (toh cuma scraping data)
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

    // Cek apakah kena blokir di awal
    const bodyText = await page.innerText("body");
    if (bodyText.includes("pemblokiran IP sementara")) {
      console.log(
        chalk.bgRed.white(" 🚨 IP MASIH DIBLOKIR! Tunggu 10 menit lagi. ")
      );
      await browser.close();
      return;
    }

    console.log(chalk.yellow(`⏳ Mengambil list cabang...`));
    const options = await page.$$eval("select#site option", (opts) =>
      opts
        .map((o) => ({ id: o.value, text: o.innerText }))
        .filter((o) => o.id !== "")
    );

    console.log(
      chalk.green(
        `\n✅ Memulai Scanning Perlahan (${options.length} Cabang)...`
      )
    );

    let updateCount = 0;
    let loopCount = 0;

    for (const opt of options) {
      loopCount++;
      const siteId = opt.id;
      const siteName = getSiteName(siteId).replace("Butik Emas LM - ", "");

      process.stdout.write(
        chalk.yellow(`   [${loopCount}/${options.length}] Scan ${siteName}... `)
      );

      // 1. Ambil Token URL
      await page.selectOption("select#site", siteId);
      await page.waitForTimeout(500);
      const token = await page.inputValue("input#t");

      if (!token) {
        process.stdout.write(chalk.red("Skip (No Token)\n"));
        continue;
      }

      const url = `https://antrean.logammulia.com/antrean?site=${siteId}&t=${token}`;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

        if (!page.url().includes("site=")) {
          // Cek blokir lagi
          if ((await page.content()).includes("pemblokiran IP")) {
            console.log(
              chalk.bgRed("\n 🛑 TERDETEKSI BLOKIR IP! BERHENTI SCANNING. ")
            );
            break;
          }
          process.stdout.write(chalk.red("Redirected\n"));
          await page.goto("https://antrean.logammulia.com/antrean");
          continue;
        }

        // 2. SCRAPE WAKDA
        let wakdaIds = await page.evaluate(() => {
          const select = document.querySelector("select#wakda");
          if (!select) return null;
          return Array.from(select.options)
            .map((o) => o.value)
            .filter((v) => v !== "");
        });

        // Fallback Regex
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

        // 3. OLAH DATA
        if (wakdaIds && wakdaIds.length > 0) {
          wakdaDb[siteId] = wakdaIds;
          updateCount++;
          process.stdout.write(chalk.green("FOUND!\n"));
          table.push([
            siteId,
            siteName,
            chalk.greenBright(JSON.stringify(wakdaIds)),
            chalk.green("UPDATED"),
          ]);
        } else {
          process.stdout.write(chalk.gray("Kosong\n"));
          const oldData = wakdaDb[siteId]
            ? JSON.stringify(wakdaDb[siteId])
            : "-";
          table.push([
            siteId,
            siteName,
            chalk.gray(oldData),
            chalk.gray("NO CHANGE"),
          ]);
        }
      } catch (e) {
        process.stdout.write(chalk.red("Timeout\n"));
      }

      // --- DELAY PENTING (ANTI-BAN) ---
      // Kita kasih jeda 2-4 detik setiap pindah cabang
      const randomDelay = Math.floor(Math.random() * 2000) + 2000;
      await delay(randomDelay);

      // Istirahat Panjang setiap 5 cabang
      if (loopCount % 5 === 0) {
        process.stdout.write(
          chalk.cyan("   ☕ Istirahat 10 detik (Safety Pause)...\n")
        );
        await delay(10000);
      }
    }

    console.log("\n" + table.toString());
    fs.writeFileSync(DB_WAKDA_PATH, JSON.stringify(wakdaDb, null, 2));
    console.log(
      chalk.bgGreen.black(
        ` \n✅ DATABASE SAVED! ${updateCount} data baru disimpan. \n`
      )
    );
  } catch (e) {
    console.log(chalk.red(`CRASH: ${e.message}`));
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeWakdaIDs };
