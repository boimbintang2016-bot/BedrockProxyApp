const rn_bridge = require('rn-bridge');
const path = require('path');
const fs = require('fs');

// Folder untuk menyimpan token login Microsoft agar tidak perlu re-login
const storageDir = path.join(__dirname, 'auth_cache');
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

// Global Variables
let proxyServer = null;
let activeTargetClient = null;

// ============================================================================
// 1. HELPER & ERROR HANDLING (MENCEGAH APLIKASI CRASH / OUT)
// ============================================================================

function sendLog(text) {
  rn_bridge.channel.send(JSON.stringify({
    type: 'LOG',
    text: text
  }));
}

// MENANGKAP UNCAUGHT ERROR DARI NODE.JS AGAR C++ THREAD TIDAK MEMANGGIL SIGABRT
process.on('uncaughtException', (err) => {
  sendLog(`[CRITICAL NODE ERROR] ${err.message}`);
  if (err.stack) {
    sendLog(`[Stack Trace] ${err.stack.split('\n').slice(0, 3).join('\n')}`);
  }
});

process.on('unhandledRejection', (reason) => {
  sendLog(`[UNHANDLED REJECTION] ${reason}`);
});

// Beri tahu UI bahwa Node.js engine berhasil berjalan
sendLog('[Node.js] Engine backend siap digunakan.');

// ============================================================================
// 2. FITUR AUTENTIKASI MICROSOFT (MSA)
// ============================================================================

async function handleMicrosoftLogin() {
  try {
    sendLog('[MSA] Memulai alur autentikasi Microsoft...');

    // Import prismarine-auth / bedrock-protocol secara terisolasi
    const { Authflow } = require('prismarine-auth');

    const authflow = new Authflow(
      '', 
      storageDir, 
      {
        authTitle: '00000000402b5328', // Bedrock App ID
        flow: 'live'
      },
      (code) => {
        // Kirim Kode & URL ke WebView React Native UI
        rn_bridge.channel.send(JSON.stringify({
          type: 'MSA_CODE',
          payload: {
            url: code.verification_uri || 'https://www.microsoft.com/link',
            code: code.user_code
          }
        }));
        sendLog(`[MSA] Silakan verifikasi kode: ${code.user_code}`);
      }
    );

    // Dapatkan Token Minecraft Bedrock
    const token = await authflow.getMinecraftBedrockToken();
    if (token) {
      sendLog('[MSA] Berhasil login & mendapatkan token Minecraft!');
      rn_bridge.channel.send(JSON.stringify({ type: 'LOGIN_SUCCESS' }));
    }
  } catch (err) {
    sendLog(`[MSA Error] Gagal melakukan autentikasi: ${err.message}`);
  }
}

// ============================================================================
// 3. LOGIKA MITM PROXY BEDROCK
// ============================================================================

function startBedrockProxy(targetHost, targetPort) {
  if (proxyServer) {
    sendLog('[Proxy] Proxy sudah berjalan!');
    return;
  }

  try {
    const bedrock = require('bedrock-protocol');
    const portNumber = parseInt(targetPort, 10) || 19132;

    sendLog(`[Proxy] Membuka Proxy Server di port 25565...`);

    // 1. Buat Local Server agar HP Client (Minecraft) bisa masuk ke 127.0.0.1:25565
    proxyServer = bedrock.createServer({
      host: '0.0.0.0',
      port: 25565,
      version: '1.26.30', // Bebas / otomatis mencocokkan
      useNativeRaknet: false,
      motd: {
        motd: 'Bedrock MITM Proxy',
        levelName: 'BedrockProxyApp'
      }
    });

    // Event ketika Player lokal masuk ke Proxy
    proxyServer.on('connect', (client) => {
      sendLog(`[Proxy] Player lokal terhubung dari ${client.connection.address}`);

      sendLog(`[Proxy] Menghubungkan ke server target (${targetHost}:${portNumber})...`);

      // 2. Sambungkan Client Bot dari Proxy ke Server Target Bedrock
      activeTargetClient = bedrock.createClient({
        host: targetHost,
        port: portNumber,
        profilesFolder: storageDir,
        offline: false
      });

      // RELAY: Paket dari Local Player -> Teruskan ke Server Target
      client.on('packet', (deserialized, meta) => {
        if (activeTargetClient && activeTargetClient.status === 2) {
          try {
            activeTargetClient.queue(meta.name, deserialized);
          } catch (e) {
            // Abaikan error format paket yang tidak cocok
          }
        }
      });

      // RELAY: Paket dari Server Target -> Teruskan ke Local Player
      activeTargetClient.on('packet', (deserialized, meta) => {
        if (client) {
          try {
            client.queue(meta.name, deserialized);
          } catch (e) {
            // Abaikan error format paket
          }
        }
      });

      // Event saat berhasil masuk server target
      activeTargetClient.on('join', () => {
        sendLog(`[Proxy] Terhubung ke Server Target! Memulai manipulasi paket...`);
      });

      activeTargetClient.on('error', (err) => {
        sendLog(`[Target Server Error] ${err.message}`);
      });

      activeTargetClient.on('close', () => {
        sendLog('[Proxy] Putus dari Server Target.');
        client.close('Koneksi server target terputus.');
      });

      client.on('close', () => {
        sendLog('[Proxy] Player lokal keluar.');
        if (activeTargetClient) {
          activeTargetClient.close();
        }
      });
    });

    sendLog('[Proxy] Proxy SIAP! Sambungkan Minecraft HP Anda ke 127.0.0.1:25565');

  } catch (err) {
    sendLog(`[Proxy Launch Error] ${err.message}`);
    proxyServer = null;
  }
}

function stopBedrockProxy() {
  if (proxyServer) {
    try {
      if (activeTargetClient) {
        activeTargetClient.close();
        activeTargetClient = null;
      }
      proxyServer.close();
      proxyServer = null;
      sendLog('[Proxy] Server Proxy dihentikan.');
    } catch (e) {
      sendLog(`[Stop Error] ${e.message}`);
    }
  } else {
    sendLog('[Proxy] Proxy memang belum aktif.');
  }
}

// ============================================================================
// 4. PESAN DARI REACT NATIVE UI (IPC CHANNEL)
// ============================================================================

rn_bridge.channel.on('message', (msgStr) => {
  try {
    const msg = JSON.parse(msgStr);

    switch (msg.type) {
      case 'START_PROXY':
        startBedrockProxy(msg.payload.host, msg.payload.port);
        break;

      case 'STOP_PROXY':
        stopBedrockProxy();
        break;

      case 'LOGIN_ACCOUNT':
        handleMicrosoftLogin();
        break;

      default:
        sendLog(`[Bridge] Tipe pesan tidak dikenal: ${msg.type}`);
        break;
    }
  } catch (e) {
    sendLog(`[Bridge Error] Parsing JSON gagal: ${e.message}`);
  }
});

