require('dotenv').config();

const proxyConfig = {
    server: process.env.PROXY_SERVER,
    username: process.env.PROXY_USER,
    password: process.env.PROXY_PASS
};

const siteKeys = {
    login: "6LdxTgUsAAAAAJ80-chHLt5PiK-xv1HbLPqQ3nB4", // ReCaptcha Login
};

module.exports = { proxyConfig, siteKeys };