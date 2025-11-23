const axios = require("axios");
const chalk = require("chalk");
const { loadSettings } = require("../data/settings");

async function sendTelegramMsg(message) {
  const settings = loadSettings();
  const token = settings.telegramToken;
  const chatId = settings.telegramChatId;

  // Cek kelengkapan config
  if (!token || !chatId) {
    // Silent fail (jangan bikin bot crash cuma gara-gara notif gagal)
    // console.log(chalk.yellow("⚠️ Telegram belum disetting. Skip notif."));
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML", // Biar bisa Bold/Italic
    });
    console.log(chalk.green("📨 Notifikasi Telegram Terkirim!"));
  } catch (error) {
    console.log(chalk.red(`❌ Gagal kirim Telegram: ${error.message}`));
  }
}

module.exports = { sendTelegramMsg };
