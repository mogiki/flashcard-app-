import AsyncStorage from '@react-native-async-storage/async-storage';

export async function loadDecks() {
  try {
    const raw = await AsyncStorage.getItem('flashDecks');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export async function saveDecks(decks) {
  try {
    await AsyncStorage.setItem('flashDecks', JSON.stringify(decks));
  } catch (e) { console.error('saveDecks error', e); }
}

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem('flashCfg');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export async function saveSettings(cfg) {
  try {
    await AsyncStorage.setItem('flashCfg', JSON.stringify(cfg));
  } catch {}
}

export async function loadProgress(key) {
  try {
    const raw = await AsyncStorage.getItem('prog_' + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveProgress(key, data) {
  try {
    await AsyncStorage.setItem('prog_' + key, JSON.stringify(data));
  } catch {}
}

export async function clearProgress(key) {
  try { await AsyncStorage.removeItem('prog_' + key); } catch {}
}

export async function clearAllProgress(deckId) {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(k => k.startsWith(`prog_${deckId}_`));
    await AsyncStorage.multiRemove(toRemove);
  } catch {}
}

export async function loadStudyLog() {
  try {
    const raw = await AsyncStorage.getItem('studyLog');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export async function saveStudyLog(log) {
  try { await AsyncStorage.setItem('studyLog', JSON.stringify(log)); } catch {}
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
