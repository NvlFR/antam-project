const { chromium } = require("playwright");
const fs = require("fs");
const chalk = require("chalk");
const { proxyConfig, siteKeys } = require("./config");
const { solveRecaptchaV2 } = require("./solver");

// Pastikan folder session ada
if (!fs.existsSync("./session")) {
  fs.mkdirSync("./session");
}

async function loginSingleAccount(account) {
  const sessionFile = `./session/${account.email}.json`;

  // Cek kalau sesi masih valid, skip login (Opsional, kita force login dulu biar aman)
  // if (fs.existsSync(sessionFile)) { ... }

  console.log(chalk.cyan(`[${account.email}] Membuka Browser...`));

  const browser = await chromium.launch({
    headless: true, // Ubah false jika ingin lihat prosesnya
    args: ["--disable-blink-features=AutomationControlled"],
  });

  // INI YANG TADI HILANG (Definisi Context)
  const context = await browser.newContext({
    proxy: proxyConfig, // Pakai proxy dari config
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  try {
    console.log(chalk.cyan(`[${account.email}] Mengakses Halaman Login...`));

    // 1. Buka Halaman
    await page.goto("https://antrean.logammulia.com/login", { timeout: 60000 });

    // 2. Isi Form
    console.log(
      chalk.cyan(`[${account.email}] Mengisi Username & Password...`)
    );
    await page.fill("#username", account.email);
    await page.fill("#password", account.password);

    // Centang Remember Me
    if (await page.isVisible("#customCheckb1")) {
      await page.check("#customCheckb1");
    }

    // 3. Handle Captcha
    console.log(chalk.yellow(`[${account.email}] Solving Captcha...`));
    const token = await solveRecaptchaV2(page.url(), siteKeys.login);

    // Inject Token
    await page.evaluate((token) => {
      document.getElementById("g-recaptcha-response").innerHTML = token;
    }, token);

    // 4. Klik Login
    console.log(chalk.blue(`[${account.email}] Klik Login...`));
    // Trik: Tunggu navigasi berbarengan dengan klik
    await Promise.all([
      page.waitForNavigation({ timeout: 60000 }).catch(() => {}), // catch biar gak error kalau timeout
      page.click('button[type="submit"]'),
    ]);

    // 5. Validasi Login
    // Cek URL atau elemen dashboard
    if (
      page.url().includes("/users") ||
      (await page.isVisible('a[href*="logout"]'))
    ) {
      const cookies = await context.cookies();
      fs.writeFileSync(sessionFile, JSON.stringify(cookies, null, 2));
      console.log(
        chalk.green(`[${account.email}] ✅ LOGIN SUKSES! Sesi tersimpan.`)
      );
    } else {
      // Cek apakah ada pesan error di layar
      const errorMsg = await page
        .textContent(".alert")
        .catch(() => "Unknown Error");
      throw new Error(
        `Login gagal. Masih di halaman login. Pesan: ${errorMsg}`
      );
    }
  } catch (error) {
    console.log(chalk.red(`[${account.email}] ❌ Gagal: ${error.message}`));
    // Screenshot error buat debugging
    await page.screenshot({
      path: `./screenshots/error_login_${account.email}.png`,
    });
  } finally {
    await browser.close();
  }
}

async function loginAllAccounts(accounts) {
  console.log(chalk.blue("\n════ LOGIN SEMUA AKUN ════"));
  for (const acc of accounts) {
    await loginSingleAccount(acc);
  }
  console.log(chalk.blue("════ SELESAI ════"));
}

module.exports = { loginAllAccounts };
