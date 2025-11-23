const { chromium } = require("playwright");
const chalk = require("chalk");
const Table = require("cli-table3");
const fs = require("fs");
const { proxyConfig, getSiteName } = require("../../config/config");
const { loadSettings } = require("../data/settings");
const { loadAccounts } = require("../data/accountManager");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkQuotaAll() {
  console.clear();
  console.log(
    chalk.blue(
      `\n[${new Date().toLocaleTimeString()}] 🔎 Pengecekan Kuota Detail (Sisa & Stok)...`
    )
  );

  const accounts = loadAccounts();
  if (accounts.length === 0) {
    console.log(chalk.red("❌ Tidak ada akun tersimpan! Tambah akun dulu."));
    return;
  }

  const botAccount = accounts[0];
  const sessionFile = `./session/${botAccount.email}.json`;
  if (!fs.existsSync(sessionFile)) {
    console.log(chalk.red(`❌ Sesi akun ${botAccount.email} tidak ditemukan.`));
    return;
  }

  if (!fs.existsSync("./screenshots")) fs.mkdirSync("./screenshots");

  // UPDATE TABEL: Menambahkan kolom Sisa & Sesi
  const table = new Table({
    head: ["NO", "CABANG", "SISA", "SESI WAKTU", "STATUS"],
    colWidths: [5, 25, 10, 30, 20],
    wordWrap: true,
  });

  const settings = loadSettings();
  const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));

  console.log(
    chalk.dim(`   Akun: ${botAccount.email} | Headless: ${settings.headless}`)
  );

  const browser = await chromium.launch({
    headless: settings.headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const contextOptions = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
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
    // --- NAVIGASI AWAL ---
    console.log(chalk.cyan("🔄 Pemanasan..."));
    await page.goto("https://antrean.logammulia.com/users", {
      timeout: 30000,
      waitUntil: "commit",
    });

    if (page.url().includes("login")) {
      console.log(chalk.red("❌ Sesi Expired!"));
      await browser.close();
      return;
    }

    // Force ke antrean
    await page.goto("https://antrean.logammulia.com/antrean", {
      waitUntil: "domcontentloaded",
    });

    // Cek Dropdown
    try {
      await page.waitForSelector("select#site", {
        state: "visible",
        timeout: 15000,
      });
    } catch (e) {
      console.log(chalk.red("❌ Gagal masuk halaman antrean."));
      await browser.close();
      return;
    }

    // Extract Token
    console.log(chalk.cyan("🔓 Extracting Token..."));
    const siteOptions = await page.$$eval("select#site option", (options) =>
      options
        .map((o) => ({ value: o.value, text: o.innerText }))
        .filter((o) => o.value !== "")
    );

    const liveSecretMap = {};
    for (const site of siteOptions) {
      await page.selectOption("select#site", site.value);
      await page.waitForTimeout(150); // Percepat dikit
      const token = await page.inputValue("input#t");
      if (token) liveSecretMap[site.value] = token;
    }
    console.log(
      chalk.green(`✅ ${Object.keys(liveSecretMap).length} Token didapat.`)
    );

    // LOOPING CHECK
    const targetSiteIds = Object.keys(liveSecretMap);
    let no = 1;

    for (const siteId of targetSiteIds) {
      const siteName = getSiteName(siteId);
      const token = liveSecretMap[siteId];
      const url = `https://antrean.logammulia.com/antrean?site=${siteId}&t=${token}`;

      process.stdout.write(chalk.yellow(`⏳ ${siteName}... `));

      try {
        await page.goto(url, { timeout: 20000, waitUntil: "domcontentloaded" });

        if (page.url().includes("/home") || page.url().includes("/users")) {
          process.stdout.write(chalk.red("REDIRECTED\n"));
          table.push([no++, siteName, "-", "-", chalk.red("BLOCKED")]);
          await page.goto("https://antrean.logammulia.com/antrean", {
            waitUntil: "commit",
          });
          continue;
        }

        // --- SCRAPING DETAIL (SISA, SESI, STOK) ---
        const data = await page.evaluate(() => {
          const bodyText = document.body.innerText;

          // 1. Cari Angka Sisa
          // Format di web: "Sisa : 35" atau "Sisa : 0"
          let sisaKuota = "Unknown";
          // Cari elemen yang mengandung teks 'Sisa :'
          const allDivs = Array.from(document.querySelectorAll("div"));
          const sisaDiv = allDivs.find(
            (el) => el.innerText.includes("Sisa :") && el.innerText.length < 50
          );

          if (sisaDiv) {
            // Ambil angkanya saja
            const match = sisaDiv.innerText.match(/Sisa\s*:\s*(\d+)/);
            if (match) sisaKuota = match[1];
          } else {
            // Cek indikator merah
            if (bodyText.includes("Kuota Tidak Tersedia")) sisaKuota = "0";
          }

          // 2. Cari Sesi Waktu
          // Format: "Sesi waktu ambil antrean : Pukul 12:00 - 12:30 WIB"
          let sesiWaktu = "-";
          const sesiDiv = allDivs.find((el) =>
            el.innerText.includes("Sesi waktu ambil antrean")
          );
          if (sesiDiv) {
            const text = sesiDiv.innerText;
            const match = text.match(/Pukul\s+([\d:]+\s*-\s*[\d:]+)/);
            if (match) sesiWaktu = match[1]; // "12:00 - 12:30"
          }

          // 3. Cek Dropdown
          const select = document.querySelector("select#wakda");
          const hasDropdown =
            select &&
            Array.from(select.options).some(
              (o) => !o.disabled && o.value !== ""
            );

          // 4. Cek Status Tutup/Penuh Text
          let globalStatus = "OPEN";
          if (bodyText.includes("TUTUP otomatis") && !hasDropdown)
            globalStatus = "CLOSED";
          if (bodyText.includes("Kuota Tidak Tersedia")) globalStatus = "FULL";

          return {
            sisa: sisaKuota,
            sesi: sesiWaktu,
            hasDropdown,
            globalStatus,
          };
        });

        // --- LOGIC PENENTUAN STATUS FINAL ---
        let statusDisplay = "";
        let sisaDisplay = data.sisa;

        // Logika Prioritas:
        // 1. Kalau Sisa = 0, maka PASTI HABIS (Meskipun dropdown nyangkut)
        // 2. Kalau Sisa > 0 dan Dropdown Ada, maka ADA KUOTA

        if (data.sisa === "0" || data.globalStatus === "FULL") {
          statusDisplay = chalk.red("❌ HABIS");
          sisaDisplay = chalk.red("0");
        } else if (data.globalStatus === "CLOSED") {
          statusDisplay = chalk.red("⛔ TUTUP");
          sisaDisplay = "-";
        } else if (parseInt(data.sisa) > 0 || data.hasDropdown) {
          // Ada kuota!
          statusDisplay = chalk.greenBright("✅ ADA KUOTA");
          sisaDisplay = chalk.greenBright(data.sisa);
        } else {
          statusDisplay = chalk.yellow("UNKNOWN");
        }

        table.push([no++, siteName, sisaDisplay, data.sesi, statusDisplay]);
        process.stdout.write(chalk.green("OK\n"));
      } catch (e) {
        process.stdout.write(chalk.red("Timeout\n"));
        table.push([no++, siteName, "?", "?", chalk.red("TIMEOUT")]);
      }

      // Delay
      const pauseTime = Math.floor(Math.random() * 1000) + 1000;
      if (no % 5 === 0) {
        process.stdout.write(chalk.cyan("   (Jeda 5s...)\n"));
        await delay(5000);
      } else {
        await delay(pauseTime);
      }
    }
  } catch (err) {
    console.log(chalk.red(`\n❌ Fatal Error: ${err.message}`));
  } finally {
    if (browser) await browser.close();
    console.log(table.toString());
  }
}

module.exports = { checkQuotaAll };
