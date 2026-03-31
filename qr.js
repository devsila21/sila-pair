const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
const pino = require("pino");
const QRCode = require('qrcode');
let router = express.Router();
const { 
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");
const { upload } = require('./mega');

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    const startTime = Date.now();

    async function SILA_MD_QR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);

        try {
            const items = ["Safari", "Chrome", "Firefox"];
            const randomItem = items[Math.floor(Math.random() * items.length)];

            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS(randomItem),
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;
                const latency = Date.now() - startTime;
                const performanceLevel = latency < 200 ? "🟢 Excellent" : latency < 500 ? "🟡 Good" : "🔴 Slow";

                try {
                    // send QR code if available
                    if (qr) {
                        const qrBuffer = await QRCode.toBuffer(qr);
                        return res.setHeader('Content-Type', 'image/png').send(qrBuffer);
                    }

                    if (connection == "open") {
                        await delay(3000);
                        let rf = __dirname + `/temp/${id}/creds.json`;

                        function generateSILA_ID() {
                            const prefix = "SILA";
                            const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                            let silaID = prefix;
                            for (let i = prefix.length; i < 22; i++) {
                                silaID += characters.charAt(Math.floor(Math.random() * characters.length));
                            }
                            return silaID;
                        }

                        const silaID = generateSILA_ID();

                        // ==== Upload session & send message ====
                        try {
                            const mega_url = await upload(fs.createReadStream(rf), `${sock.user.id}.json`);
                            const string_session = mega_url.replace('https://mega.nz/file/', '');
                            let session_code = "sila~" + string_session;

                            // send session code first
                            let codeMsg = await sock.sendMessage(sock.user.id, { text: session_code });

                            // send styled message with BOX
                            let textMsg = `┏━❑ *SILA-MD SESSION* ✅
┏━❑ *SAFETY RULES* ━━━━━━━━━
┃ 🔹 *Session ID:* Sent above.
┃ 🔹 *Warning:* Do not share this code!.
┃ 🔹 Keep this code safe.
┃ 🔹 Valid for 24 hours only.
┗━━━━━━━━━━━━━━━
┏━❑ *CHANNEL* ━━━━━━━━━
┃ 📢 Follow our channel: https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02
┗━━━━━━━━━━━━━━━
┏━❑ *REPOSITORY* ━━━━━━━━━
┃ 💻 Repository: https://github.com/Sila-Md/SILA-MD
┃ 👉 Fork & contribute!
┗━━━━━━━━━━━━━━━

╔► 𝐏𝐞𝐫𝐟𝐨𝐫𝐦𝐚𝐧𝐜𝐞 𝐋𝐞𝐯𝐞𝐥:
╠► ${performanceLevel}
╚► → 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 𝐭𝐢𝐦𝐞: ${latency}ms

> © 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`;

                            await sock.sendMessage(sock.user.id, {
                                text: textMsg,
                                contextInfo: {
                                    externalAdReply: {
                                        title: 'SILA MD',
                                        body: '© Sila Tech',
                                        thumbnailUrl: 'https://files.catbox.moe/36vahk.png',
                                        thumbnailWidth: 64,
                                        thumbnailHeight: 64,
                                        sourceUrl: 'https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02',
                                        mediaUrl: 'https://files.catbox.moe/36vahk.png',
                                        showAdAttribution: true,
                                        renderLargerThumbnail: false,
                                        previewType: 'PHOTO',
                                        mediaType: 1
                                    },
                                    forwardedNewsletterMessageInfo: {
                                        newsletterJid: '120363402325089913@newsletter',
                                        newsletterName: '© Sila Tech',
                                        serverMessageId: Math.floor(Math.random() * 1000000)
                                    },
                                    isForwarded: true,
                                    forwardingScore: 999
                                }
                            });

                        } catch (e) {
                            console.error("Error in session upload:", e);
                            let ddd = await sock.sendMessage(sock.user.id, { text: e.toString() });

                            let textMsg = `┏━❑ *SILA-MD SESSION* ⚠️
┏━❑ *SAFETY RULES* ━━━━━━━━━
┃ 🔹 *Session ID:* Error occurred
┃ 🔹 *Warning:* Do not share this code!.
┃ 🔹 Keep this code safe.
┃ 🔹 Valid for 24 hours only.
┗━━━━━━━━━━━━━━━
┏━❑ *CHANNEL* ━━━━━━━━━
┃ 📢 Follow our channel: https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02
┗━━━━━━━━━━━━━━━
┏━❑ *REPOSITORY* ━━━━━━━━━
┃ 💻 Repository: https://github.com/Sila-Md/SILA-MD
┃ 👉 Fork & contribute!
┗━━━━━━━━━━━━━━━

╔► 𝐏𝐞𝐫𝐟𝐨𝐫𝐦𝐚𝐧𝐜𝐞 𝐋𝐞𝐯𝐞𝐥:
╠► ${performanceLevel}
╚► → 𝐑𝐞𝐬𝐩𝐨𝐧𝐬𝐞 𝐭𝐢𝐦𝐞: ${latency}ms

> © 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`;

                            await sock.sendMessage(sock.user.id, {
                                text: textMsg,
                                contextInfo: {
                                    externalAdReply: {
                                        title: 'SILA MD',
                                        body: '© Sila Tech',
                                        thumbnailUrl: 'https://files.catbox.moe/36vahk.png',
                                        thumbnailWidth: 64,
                                        thumbnailHeight: 64,
                                        sourceUrl: 'https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02',
                                        mediaUrl: 'https://files.catbox.moe/36vahk.png',
                                        showAdAttribution: true,
                                        renderLargerThumbnail: false,
                                        previewType: 'PHOTO',
                                        mediaType: 1
                                    },
                                    forwardedNewsletterMessageInfo: {
                                        newsletterJid: '120363402325089913@newsletter',
                                        newsletterName: '© Sila Tech',
                                        serverMessageId: Math.floor(Math.random() * 1000000)
                                    },
                                    isForwarded: true,
                                    forwardingScore: 999
                                }
                            });
                        }

                        await delay(10);
                        await sock.ws.close();
                        await removeFile('./temp/' + id);
                        console.log(`👤 ${sock.user.id} 🔥 SILA-MD Session Connected ✅`);
                        await delay(10);
                        process.exit(0);
                    }
                } catch (err) {
                    console.log("⚠️ Error in connection.update:", err);
                }

                if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output?.statusCode != 401) {
                    await delay(10);
                    SILA_MD_QR_CODE();
                }
            });

        } catch (err) {
            console.log("⚠️ SILA-MD Connection failed — Restarting service...", err);
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.status(500).json({ error: "Service Unavailable" });
            }
        }
    }

    await SILA_MD_QR_CODE();
});

module.exports = router;
