const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const { proxyConfig, secretMap, getSiteName, siteKeys } = require("./config");
const { solveRecaptchaV2 } = require("./solver");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function executeWarSingle(account, targetSiteId) {
  console.log(chalk.blue(`\n⚔️  MEMULAI PERANG: ${chalk.bold(account.email)}`));

  // 1. Cek Session
  const sessionFile = `./session/${account.email}.json`;
  if (!fs.existsSync(sessionFile)) {
    console.log(chalk.red(`❌ Session tidak ada! Login dulu di Menu 1.`));
    return;
  }

  const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
  const siteToken = secretMap[targetSiteId];
  const url = `https://antrean.logammulia.com/antrean?site=${targetSiteId}&t=${siteToken}`;

  // 2. Launch Browser (Headless FALSE biar kelihatan dulu saat testing)
  const browser = await chromium.launch({
    headless: false, // Ubah ke true nanti kalau sudah lancar
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    proxy: proxyConfig,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    console.log(chalk.yellow(`🚀 Meluncur ke ${getSiteName(targetSiteId)}...`));
    await page.goto(url, { timeout: 30000, waitUntil: "domcontentloaded" });

    // Cek apakah session expired
    if (page.url().includes("login")) {
      throw new Error("Session Expired (Terlempar ke Login)");
    }

    // 3. Cek Slot Waktu
    console.log(chalk.cyan("👀 Mencari slot waktu tersedia..."));

    // Tunggu dropdown muncul
    await page
      .waitForSelector("select#wakda", { timeout: 5000 })
      .catch(() => null);

    // Ambil semua value option yang tidak disabled dan tidak kosong
    const availableSlots = await page.evaluate(() => {
      const options = Array.from(
        document.querySelectorAll("select#wakda option")
      );
      return options
        .filter((opt) => !opt.disabled && opt.value !== "")
        .map((opt) => opt.value);
    });

    if (availableSlots.length === 0) {
      console.log(chalk.red("❌ TIDAK ADA SLOT! (Penuh/Belum Buka)"));
      // Opsional: Screenshot bukti penuh
      // await page.screenshot({ path: `failed_full_${account.email}.png` });
      await browser.close();
      return;
    }

    // PILIH SLOT PERTAMA YANG ADA
    const targetSlot = availableSlots[0];
    console.log(
      chalk.greenBright(
        `✅ Slot Ditemukan! ID: ${targetSlot}. Mengunci target...`
      )
    );

    // Pilih di dropdown
    await page.selectOption("select#wakda", targetSlot);

    // 4. SOLVE CAPTCHA (Bagian Paling Lama)
    console.log(chalk.yellow("🧩 Memecahkan Captcha (Mohon bersabar)..."));

    // Kita pakai siteKey antrean dari config
    const tokenCaptcha = await solveRecaptchaV2(page.url(), siteKeys.antrean);

    if (!tokenCaptcha) throw new Error("Gagal mendapatkan token Captcha");

    // Inject Token ke textarea hidden
    console.log(chalk.blue("💉 Menyuntikkan Token Captcha..."));
    await page.evaluate((token) => {
      document.getElementById("g-recaptcha-response").innerHTML = token;
    }, tokenCaptcha);

    // 5. EKSEKUSI TOMBOL DAFTAR
    console.log(chalk.magenta("🔥 MENEKAN TOMBOL AMBIL ANTREAN..."));

    // Cari tombol submit di dalam form yang sesuai
    // Biasanya tombolnya: <button class="btn btn-secondary...> atau btn-primary
    // Kita cari tombol submit generik
    await Promise.all([
      // Tunggu navigasi setelah klik (bisa sukses atau gagal)
      page.waitForNavigation({ timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);

    // 6. CEK HASIL
    const finalUrl = page.url();
    console.log(chalk.gray(`Current URL: ${finalUrl}`));

    if (finalUrl.includes("success") || finalUrl.includes("tiket")) {
      console.log(
        chalk.green.bold("\n🎉🎉 SUCCESS! TIKET BERHASIL DIAMANKAN! 🎉🎉")
      );
      console.log(chalk.white("Cek folder screenshot untuk bukti."));
      await page.screenshot({
        path: `./screenshots/SUCCESS_${account.email}_${Date.now()}.png`,
      });
    } else if (finalUrl.includes("antrean")) {
      // Masih di halaman antrean, mungkin error alert
      const errorText = await page
        .locator(".alert")
        .textContent()
        .catch(() => "Unknown Error");
      console.log(chalk.red(`❌ Gagal: ${errorText.trim()}`));
    } else {
      console.log(chalk.yellow("⚠️ Status tidak diketahui, cek manual."));
    }
  } catch (error) {
    console.error(chalk.red(`\n❌ EROR WAR: ${error.message}`));
    await page.screenshot({
      path: `./screenshots/error_war_${account.email}.png`,
    });
  } finally {
    console.log(chalk.dim("Menutup browser..."));
    await browser.close();
  }
}

module.exports = { executeWarSingle };
