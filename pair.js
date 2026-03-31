const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const zlib = require('zlib');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    Browsers, 
    makeCacheableSignalKeyStore 
} = require('@whiskeysockets/baileys');
const { upload } = require('./mega');
const { sendButtons } = require('gifted-btns');

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;
    let sessionOption = req.query.option || 'long'; // long, short, creds

    if (!num) {
        return res.status(400).json({ error: "Number is required" });
    }

    async function SILA_MD_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        
        try {
            const items = ["Safari", "Chrome", "Firefox"];
            const randomItem = items[Math.floor(Math.random() * items.length)];
            
            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                generateHighQualityLinkPreview: true,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                syncFullHistory: false,
                browser: Browsers.macOS(randomItem)
            });
            
            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);
                if (!res.headersSent) await res.send({ code });
            }
            
            sock.ev.on('creds.update', saveCreds);
            
            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection == "open") {
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
                        
                        // Send session with buttons
                        let sessionSent = false;
                        let sendAttempts = 0;
                        const maxSendAttempts = 3;

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
                                
                                sessionSent = true;
                                console.log("✅ creds.json file sent successfully!");
                            } catch (sendError) {
                                console.error("Send error:", sendError);
                                sessionSent = true; // Try to continue
                            }
                        } else {
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

                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output?.statusCode != 401) {
                    await delay(10);
                    SILA_MD_PAIR_CODE();
                }
            });
            
        } catch (err) {
            console.log("⚠️ SILA-MD Connection failed — Restarting service...", err);
            await removeFile('./temp/' + id);
            if (!res.headersSent) await res.send({ code: "❗ SILA-MD Service Unavailable" });
        }
    }

    return await SILA_MD_PAIR_CODE();
});

module.exports = router;
