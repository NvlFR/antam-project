require("dotenv").config();

const proxyConfig = {
  server: process.env.PROXY_SERVER,
  username: process.env.PROXY_USER,
  password: process.env.PROXY_PASS,
};

const siteKeys = {
  login: "6LdxTgUsAAAAAJ80-chHLt5PiK-xv1HbLPqQ3nB4",
  antrean: "6LdxTgUsAAAAAJ80-chHLt5PiK-xv1HbLPqQ3nB4", // Biasanya sama
};

// Mapping ID Cabang ke Token Rahasia (Bypass Dropdown)
const secretMap = {
  4: "49ab32490d01ff03d2e38394a7bb5d13632077e1c29cd159824a5d2b67068e1b", // Balikpapan
  1: "5804ddc239cb88c63ddc6ed95b6e7448ce429ac601105c5df02db5809c444f5a", // Bandung
  19: "5bb290b6476d27b5dc4554d1de28afa38addcfd9d8fc8173eaee0f5e2c724be4", // Bekasi
  16: "8b908ea214ff714e044fbc6227a9075786aee1de8060887865b2cb8f1b6c7047", // Bintaro
  17: "1711e9a491d316696e958951ad43095895fb4fe1aae763713fc53dde49f36c08", // Bogor
  5: "f46dd365f97c078c96bfdbf4951fb7ba4e9d6cd19df31c036680dffacf92616c", // Denpasar
  20: "ef9355153d1dedf6ee1e196bcb5e39ac864e2cee68fa4a6d197d354a32446cfa", // Djuanda
  6: "2d8ab5d3e179988e9b7fc3258d6966418a6ed67b5340db39f60a58100d6cf4ca", // Gedung Antam
  3: "fff9dd3d663c298e82f80d8fd185ffc68ddad18bc448a9b633f2b3af721fc022", // Graha Dipta
  11: "371bc0a7a08912012fccb4eacc5850f908103fef53be98d94ec10c5818521aa8", // Makassar
  10: "411a97f0038d4e7dc7b883689b20dd80a99958579986c1701eefdee879c62dd2", // Medan
  12: "42fc6d53c7fe69cf4dcc3ec7d5a247ea2532cf5800e56b3fdb4fa890594d0f4b", // Palembang
  24: "010c9c769d226147f22ab019ef6e3f5b9f70c22678f62c20a08ff974cd794f87", // Pekanbaru
  21: "1ca4355363523a7d6824f8aade5cbd00fec21ea1d4bc3a5cecac7485ec4e6447", // Puri Indah
  15: "75d3c46ddeb5f13f0aa021847f16cbad195243869b29ec47697fa3dd654cd7d8", // Semarang
  23: "cc3071cc9c96af4a81cf19cc87ed76057b964d01117a6bd87e45c1b88d9ab51f", // Serpong
  8: "26f567e14b9744f50b9903be77c377a5322884d1b4a4076ccf4780b41809c28b", // Setiabudi One
  13: "a3e63b82063ef2e3f6715d700c1de4c191abc8d97ca2da0e342e7adf6bb259e5", // Surabaya 1 Darmo
  14: "1a105b5a724b99400a715b6b8d043bf9f3b821c1caca1a599d3e7e1b1576b55a", // Surabaya 2 Pakuwon
  9: "b47560b59c11452b1eaf31ecc2a32a0e2751e38b430c25a5c8eaf3a92b8bfe84", // Yogyakarta
};

// Helper untuk mendapatkan Nama Cabang
const getSiteName = (id) => {
  const names = {
    4: "Butik Emas LM - Balikpapan",
    1: "Butik Emas LM - Bandung",
    19: "Butik Emas LM - Bekasi",
    16: "Butik Emas LM - Bintaro",
    17: "Butik Emas LM - Bogor",
    5: "Butik Emas LM - Denpasar",
    20: "Butik Emas LM - Djuanda",
    6: "Butik Emas LM - Gedung Antam",
    3: "Butik Emas LM - Graha Dipta",
    11: "Butik Emas LM - Makassar",
    10: "Butik Emas LM - Medan",
    12: "Butik Emas LM - Palembang",
    24: "Butik Emas LM - Pekanbaru",
    21: "Butik Emas LM - Puri Indah",
    15: "Butik Emas LM - Semarang",
    23: "Butik Emas LM - Serpong",
    8: "Butik Emas LM - Setiabudi One",
    13: "Butik Emas LM - Surabaya 1 Darmo",
    14: "Butik Emas LM - Surabaya 2 Pakuwon",
    9: "Butik Emas LM - Yogyakarta",
  };
  return names[id] || `Site ID ${id}`;
};

module.exports = { proxyConfig, siteKeys, secretMap, getSiteName };
