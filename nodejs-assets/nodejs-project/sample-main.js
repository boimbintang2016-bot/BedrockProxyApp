const rn_bridge = require('rn-bridge');
const { Relay, createClient } = require('bedrock-protocol');

let activeRelay = null;

// Fungsi pembantu untuk mengirim log balik ke UI React Native
function sendLog(msg) {
    rn_bridge.channel.post('message', JSON.stringify({ type: 'LOG', text: msg }));
}

rn_bridge.channel.on('message', (msgStr) => {
    try {
        const action = JSON.parse(msgStr);

        // 1. KONTROL MITM PROXY
        if (action.type === 'START_PROXY') {
            const { host, port } = action.payload;

            if (activeRelay) {
                sendLog('[i] Memberhentikan Proxy lama...');
                activeRelay.close();
                activeRelay = null;
            }

            sendLog(`[Proxy] Memulai Proxy -> ${host}:${port}`);

            activeRelay = new Relay({
                host: '0.0.0.0',
                port: 25565,
                raknetBackend: 'js',
                destination: {
                    host: host,
                    port: parseInt(port) || 19132,
                    offline: false,
                    profilesFolder: './auth',
                    authTitle: 'MinecraftAndroid'
                }
            });

            activeRelay.listen();
            sendLog(`[✓] Proxy aktif di Port 25565!`);

            activeRelay.on('connect', player => {
                sendLog(`[+] MCPE Terhubung! Meneruskan ke ${host}...`);

                player.on('close', (reason) => {
                    sendLog(`[-] MCPE Terputus: ${reason || 'Closed'}`);
                });

                player.on('error', (err) => {
                    sendLog(`[!] Player Error: ${err.message}`);
                });
            });

            activeRelay.on('error', (err) => {
                sendLog(`[!] Relay Error: ${err.message}`);
            });
        }

        if (action.type === 'STOP_PROXY') {
            if (activeRelay) {
                activeRelay.close();
                activeRelay = null;
                sendLog('[✓] Proxy Dihentikan.');
            }
        }

        // 2. FUNGSI ADD ACCOUNT (MICROSOFT AUTH)
        if (action.type === 'LOGIN_ACCOUNT') {
            sendLog('[MSA] Memulai sesi otentikasi Microsoft...');

            const client = createClient({
                host: 'play.nethergames.org',
                port: 19132,
                profilesFolder: './auth',
                onMsaCode: (data) => {
                    // Kirim URL & Kode 8-Digit ke React Native WebView
                    rn_bridge.channel.post('message', JSON.stringify({
                        type: 'MSA_CODE',
                        payload: {
                            url: data.verification_uri || 'https://microsoft.com/link',
                            code: data.user_code
                        }
                    }));
                }
            });

            client.on('spawn', () => {
                sendLog('[✓] LOGIN BERHASIL! Token tersimpan di ./auth');
                rn_bridge.channel.post('message', JSON.stringify({ type: 'LOGIN_SUCCESS' }));
                client.disconnect();
            });

            client.on('error', (err) => {
                sendLog(`[!] Auth Error: ${err.message}`);
            });
        }

    } catch (err) {
        sendLog(`[!] Bridge Error: ${err.message}`);
    }
});

