import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Clipboard,
  Alert
} from 'react-native';
import nodejs from 'nodejs-mobile-react-native';
import { WebView } from 'react-native-webview';

const App = () => {
  const [serverHost, setServerHost] = useState('play.mineville.com');
  const [serverPort, setServerPort] = useState('19132');
  const [isProxyRunning, setIsProxyRunning] = useState(false);
  const [logs, setLogs] = useState(['[System] Aplikasi siap.']);
  
  // State untuk Modal WebView Login
  const [msaModalVisible, setMsaModalVisible] = useState(false);
  const [msaUrl, setMsaUrl] = useState('');
  const [msaCode, setMsaCode] = useState('');

  useEffect(() => {
    // Start Node.js engine di background
    nodejs.start('main.js');

    // Menerima pesan/log dari Node.js
    const listener = (msgStr) => {
      try {
        const msg = JSON.parse(msgStr);

        if (msg.type === 'LOG') {
          addLog(msg.text);
        }

        if (msg.type === 'MSA_CODE') {
          setMsaUrl(msg.payload.url);
          setMsaCode(msg.payload.code);
          setMsaModalVisible(true);
          addLog(`[MSA] Kode Anda: ${msg.payload.code}`);
        }

        if (msg.type === 'LOGIN_SUCCESS') {
          setMsaModalVisible(false);
          Alert.alert('Sukses', 'Akun Microsoft berhasil ditambahkan!');
        }
      } catch (e) {
        addLog(msgStr);
      }
    };

    nodejs.channel.addListener('message', listener);
  }, []);

  const addLog = (text) => {
    setLogs((prevLogs) => [...prevLogs, text]);
  };

  const handleStartStopProxy = () => {
    if (isProxyRunning) {
      nodejs.channel.post('message', JSON.stringify({ type: 'STOP_PROXY' }));
      setIsProxyRunning(false);
    } else {
      if (!serverHost) {
        Alert.alert('Error', 'Domain/IP Server tidak boleh kosong!');
        return;
      }
      nodejs.channel.post('message', JSON.stringify({
        type: 'START_PROXY',
        payload: { host: serverHost, port: serverPort }
      }));
      setIsProxyRunning(true);
    }
  };

  const handleAddAccount = () => {
    addLog('[i] Meminta kode login...');
    nodejs.channel.post('message', JSON.stringify({ type: 'LOGIN_ACCOUNT' }));
  };

  const copyCodeToClipboard = () => {
    Clipboard.setString(msaCode);
    Alert.alert('Tersalin!', `Kode ${msaCode} berhasil disalin ke clipboard.`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Bedrock MITM Proxy</Text>

      {/* INPUT SERVER DOMAIN / IP */}
      <View style={styles.card}>
        <Text style={styles.label}>Target Server Domain / IP:</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. play.mineville.com"
          value={serverHost}
          onChangeText={setServerHost}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Port Server:</Text>
        <TextInput
          style={styles.input}
          placeholder="19132"
          keyboardType="numeric"
          value={serverPort}
          onChangeText={setServerPort}
        />

        <TouchableOpacity
          style={[styles.button, isProxyRunning ? styles.btnDanger : styles.btnSuccess]}
          onPress={handleStartStopProxy}
        >
          <Text style={styles.btnText}>
            {isProxyRunning ? 'STOP PROXY' : 'START PROXY (Port 25565)'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Aksi Tambah Akun */}
      <TouchableOpacity style={styles.btnAccount} onPress={handleAddAccount}>
        <Text style={styles.btnText}>+ Tambah Akun Microsoft</Text>
      </TouchableOpacity>

      {/* TERMINAL LOG VIEW */}
      <Text style={styles.label}>Activity Console Log:</Text>
      <ScrollView style={styles.logContainer}>
        {logs.map((log, index) => (
          <Text key={index} style={styles.logText}>{log}</Text>
        ))}
      </ScrollView>

      {/* MODAL WEBVIEW UNTUK LOGIN MICROSOFT */}
      <Modal visible={msaModalVisible} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Kode Anda: {msaCode}</Text>
            <TouchableOpacity style={styles.btnCopy} onPress={copyCodeToClipboard}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Salin Kode</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ textAlign: 'center', padding: 5, color: '#666' }}>
            Tempelkan kode di atas pada halaman di bawah ini:
          </Text>
          <WebView source={{ uri: msaUrl }} style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.btnCloseModal}
            onPress={() => setMsaModalVisible(false)}
          >
            <Text style={styles.btnText}>Tutup / Batal</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#121212' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 15, textAlign: 'center' },
  card: { backgroundColor: '#1e1e1e', padding: 15, borderRadius: 8, marginBottom: 15 },
  label: { color: '#bbb', marginBottom: 5, fontWeight: '600' },
  input: { backgroundColor: '#2a2a2a', color: '#fff', padding: 10, borderRadius: 5, marginBottom: 12 },
  button: { padding: 12, borderRadius: 5, alignItems: 'center', marginTop: 5 },
  btnSuccess: { backgroundColor: '#2e7d32' },
  btnDanger: { backgroundColor: '#c62828' },
  btnAccount: { backgroundColor: '#0288d1', padding: 12, borderRadius: 5, alignItems: 'center', marginBottom: 15 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  logContainer: { flex: 1, backgroundColor: '#000', padding: 10, borderRadius: 5 },
  logText: { color: '#00ff00', fontFamily: 'monospace', fontSize: 12, marginBottom: 4 },
  modalHeader: { padding: 15, backgroundColor: '#2196f3', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  btnCopy: { backgroundColor: '#333', padding: 8, borderRadius: 4 },
  btnCloseModal: { backgroundColor: '#777', padding: 12, alignItems: 'center' }
});

export default App;

