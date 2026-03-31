const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
const pino = require("pino");
const zlib = require('zlib');
let router = express.Router();
const { 
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");
const { upload } = require('./mega');
const { sendButtons } = require('gifted-btns');

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    const number = req.query.number;
    let sessionOption = req.query.option || 'long'; // long, short, creds

    if (!number) {
        return res.status(400).json({ error: "Number required! Use: /pair?number=255XXXXXXXXX&option=long" });
    }

    // Send response immediately to prevent timeout
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>SILA-MD Pairing</title>
            <meta http-equiv="refresh" content="30">
            <style>
                body { font-family: Arial; background: #000; color: #fff; text-align: center; padding: 50px; }
                .loading { font-size: 24px; color: #00ff88; }
                .info { margin-top: 20px; color: #888; }
            </style>
        </head>
        <body>
            <div class="loading">⏳ Connecting to WhatsApp...</div>
            <div class="info">Check your WhatsApp for pairing code!</div>
            <div class="info">Number: ${number}</div>
            <div class="info">Option: ${sessionOption}</div>
        </body>
        </html>
    `);
    res.end();

    // Process in background
    processPairing(id, number, sessionOption);
});

async function processPairing(id, number, sessionOption) {
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
            const { connection, lastDisconnect } = s;

            try {
                // Request pairing code when connection is connecting
                if (s.requestPairingCode) {
                    const code = await s.requestPairingCode(number);
                    console.log(`📱 Pairing code for ${number}: ${code}`);
                }

                if (connection == "open") {
                    console.log(`✅ Connected successfully as: ${sock.user.id}`);
                    await delay(5000);

                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 20;

                    console.log("⏳ Waiting for session file...");
                    
                    while (attempts < maxAttempts && !sessionData) {
                        try {
                            const credsPath = `./temp/${id}/creds.json`;
                            if (fs.existsSync(credsPath)) {
                                const data = fs.readFileSync(credsPath);
                                if (data && data.length > 100) {
                                    sessionData = data;
                                    console.log(`✅ Session file found (${data.length} bytes)`);
                                    break;
                                }
                            }
                            await delay(3000);
                            attempts++;
                            console.log(`⏳ Waiting for session... (${attempts}/${maxAttempts})`);
                        } catch (readError) {
                            console.error("Read error:", readError);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        console.error("❌ Session data not found");
                        await removeFile('./temp/' + id);
                        return;
                    }

                    try {
                        let session_code = "";
                        let msgText = "";
                        let sessionType = "";
                        
                        // Option 1: LONG Session (Compressed Base64)
                        if (sessionOption === 'long') {
                            let compressedData = zlib.gzipSync(sessionData);
                            let b64data = compressedData.toString('base64');
                            session_code = "sila~" + b64data;
                            sessionType = "LONG SESSION (Compressed Base64)";
                            console.log(`📱 Long session length: ${session_code.length} chars`);
                            
                            msgText = `*━━━━━━━━━━━━━━━━━━*\n*✅ SILA-MD LONG SESSION*\n*━━━━━━━━━━━━━━━━━━*\n\n\`\`\`${session_code}\`\`\`\n\n*📌 SESSION INFO:*\n🔹 Type: Long Session (Compressed)\n🔹 Valid for: 24 hours\n🔹 Length: ${session_code.length} chars\n🔹 Original Size: ${sessionData.length} bytes\n\n*⚠️ WARNING:*\nCopy this full session string\nPaste in config.js or config.env\n\n*━━━━━━━━━━━━━━━━━━*\n*© SILA TECH*`;
                        }
                        
                        // Option 2: SHORT Session (Mega Link)
                        else if (sessionOption === 'short') {
                            const rf = `./temp/${id}/creds.json`;
                            const mega_url = await upload(fs.createReadStream(rf), `${sock.user.id}.json`);
                            const string_session = mega_url.replace('https://mega.nz/file/', '');
                            session_code = "sila~" + string_session;
                            sessionType = "SHORT SESSION (Mega Link)";
                            console.log(`📱 Short session length: ${session_code.length} chars`);
                            
                            msgText = `*━━━━━━━━━━━━━━━━━━*\n*✅ SILA-MD SHORT SESSION*\n*━━━━━━━━━━━━━━━━━━*\n\n\`\`\`${session_code}\`\`\`\n\n*📌 SESSION INFO:*\n🔹 Type: Short Session (Mega)\n🔹 Valid for: 24 hours\n🔹 Length: ${session_code.length} chars\n\n*⚠️ WARNING:*\nCopy this session string\nPaste in config.js or config.env\n\n*━━━━━━━━━━━━━━━━━━*\n*© SILA TECH*`;
                        }
                        
                        // Option 3: CREDS.JSON File Only
                        else if (sessionOption === 'creds') {
                            session_code = "creds.json file attached below";
                            sessionType = "CREDS.JSON FILE";
                            
                            msgText = `*━━━━━━━━━━━━━━━━━━*\n*✅ SILA-MD CREDS.JSON FILE*\n*━━━━━━━━━━━━━━━━━━*\n\n*📌 FILE INFO:*\n🔹 Type: creds.json\n🔹 Valid for: 24 hours\n🔹 Original Size: ${sessionData.length} bytes\n\n*⚠️ INSTRUCTIONS:*\n1. Download the creds.json file below\n2. Place it in the 'sessions' folder\n3. Restart your bot\n\n*━━━━━━━━━━━━━━━━━━*\n*© SILA TECH*`;
                        }
                        
                        const msgButtons = [
                            { 
                                name: 'cta_copy', 
                                buttonParamsJson: JSON.stringify({ 
                                    display_text: sessionOption === 'creds' ? '📥 DOWNLOAD CREDS.JSON' : '📋 COPY SESSION', 
                                    copy_code: session_code 
                                }) 
                            },
                            { 
                                name: 'cta_url', 
                                buttonParamsJson: JSON.stringify({ 
                                    display_text: '📦 BOT REPO', 
                                    url: 'https://github.com/Sila-Md/SILA-MD' 
                                }) 
                            },
                            { 
                                name: 'cta_url', 
                                buttonParamsJson: JSON.stringify({ 
                                    display_text: '📢 CHANNEL', 
                                    url: 'https://whatsapp.com/channel/0029VbBG4gfISTkCpKxyMH02' 
                                }) 
                            }
                        ];

                        await delay(2000);
                        
                        // For creds option, send file directly
                        if (sessionOption === 'creds') {
                            try {
                                await sock.sendMessage(sock.user.id, {
                                    text: msgText,
                                    buttons: msgButtons
                                });
                                
                                // Send the creds.json file
                                await sock.sendMessage(sock.user.id, {
                                    document: fs.readFileSync(`./temp/${id}/creds.json`),
                                    mimetype: 'application/json',
                                    fileName: 'creds.json',
                                    caption: '📄 Your creds.json file - Save this in your sessions folder'
                                });
                                
                                console.log("✅ creds.json file sent successfully!");
                            } catch (sendError) {
                                console.error("Send error:", sendError);
                            }
                        } else {
                            // Send session with buttons
                            let sessionSent = false;
                            let sendAttempts = 0;
                            const maxSendAttempts = 3;

                            while (sendAttempts < maxSendAttempts && !sessionSent) {
                                try {
                                    await sendButtons(sock, sock.user.id, {
                                        title: sessionOption === 'long' ? '🎉 SILA-MD LONG SESSION' : '🎉 SILA-MD SHORT SESSION',
                                        text: msgText,
                                        footer: '© SILA TECH - Powered by Sila Tech',
                                        buttons: msgButtons
                                    });
                                    sessionSent = true;
                                    console.log(`✅ ${sessionType} sent successfully with copy button!`);
                                } catch (sendError) {
                                    console.error("Send error:", sendError);
                                    sendAttempts++;
                                    if (sendAttempts < maxSendAttempts) {
                                        await delay(3000);
                                    } else {
                                        // Fallback: send plain text
                                        await sock.sendMessage(sock.user.id, { 
                                            text: `*SILA-MD ${sessionType}*\n\n${session_code}\n\nCopy this session and keep it safe!\n\n© SILA TECH` 
                                        });
                                        console.log("✅ Session sent as plain text fallback");
                                    }
                                }
                            }
                        }

                        await delay(3000);
                        await sock.ws.close();
                        await removeFile('./temp/' + id);
                        console.log(`👤 ${sock.user.id} 🔥 SILA-MD Session Connected ✅ (${sessionType})`);
                        
                    } catch (e) {
                        console.error("Session processing error:", e);
                        try {
                            await sock.sendMessage(sock.user.id, { text: `Error: ${e.toString()}` });
                        } catch (err) {
                            console.error("Failed to send error message:", err);
                        }
                    }
                }
            } catch (err) {
                console.log("⚠️ Error in connection.update:", err);
            }

            if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output?.statusCode != 401) {
                await delay(10);
                // Don't restart automatically to avoid loops
                console.log("Connection closed, cleaning up...");
                await removeFile('./temp/' + id);
            }
        });

    } catch (err) {
        console.log("⚠️ SILA-MD Connection failed:", err);
        await removeFile('./temp/' + id);
    }
}

module.exports = router;
