import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

export async function pickAndParseFile() {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/html', 'text/csv', 'application/octet-stream', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
    const name = asset.name || 'deck';
    const title = name.replace(/\.[^.]+$/, '');
    const lower = name.toLowerCase();
    if (lower.endsWith('.csv')) {
      return { title, cards: parseCSV(content) };
    } else {
      return { title, cards: parseMHTorHTML(content) };
    }
  } catch (e) {
    console.error('pickAndParseFile', e);
    return null;
  }
}

function parseMHTorHTML(content) {
  let html = content;
  if (content.includes('MIME-Version') || content.includes('Content-Type: multipart')) {
    const m = content.match(/Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\n\r?\nContent-Type:|$)/i);
    if (m) {
      html = m[1];
      const enc = content.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1]?.toLowerCase();
      if (enc === 'quoted-printable') html = decodeQP(html);
    }
  }
  return extractFromHTML(html);
}

function decodeQP(str) {
  return str.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractFromHTML(html) {
  // Match Quizlet card structure
  const cards = [];
  const regex = /data-testid="set-page-term-card-side"[^>]*>([\s\S]*?)<\/div>/g;
  const matches = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    const text = stripTags(m[1]).trim();
    if (text) matches.push(text);
  }
  for (let i = 0; i < matches.length - 1; i += 2) {
    if (matches[i] && matches[i + 1]) {
      cards.push(makeCard(matches[i], matches[i + 1]));
    }
  }
  // Fallback: try TermText spans
  if (cards.length === 0) {
    const termRegex = /class="TermText[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
    const terms = [];
    while ((m = termRegex.exec(html)) !== null) {
      const text = stripTags(m[1]).trim();
      if (text) terms.push(text);
    }
    for (let i = 0; i < terms.length - 1; i += 2) {
      cards.push(makeCard(terms[i], terms[i + 1]));
    }
  }
  return cards;
}

function stripTags(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

function parseCSV(content) {
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const frontIdx = headers.findIndex(h => ['front', 'term', '앞면'].includes(h));
  const backIdx = headers.findIndex(h => ['back', 'definition', '뒷면'].includes(h));
  const statusIdx = headers.indexOf('status');
  const starIdx = headers.indexOf('starred');
  const cards = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    if (!row.length) continue;
    const front = (row[frontIdx] || '').trim();
    const back = (row[backIdx] || '').trim();
    if (!front || !back) continue;
    cards.push({
      ...makeCard(front, back),
      status: statusIdx >= 0 ? row[statusIdx] || '' : '',
      starred: starIdx >= 0 ? row[starIdx] === 'true' : false,
    });
  }
  return cards;
}

function parseCSVRow(line) {
  const cells = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

function makeCard(front, back) {
  return {
    id: Date.now() + Math.random(),
    front,
    back,
    status: '',
    starred: false,
    lastStudied: null,
    reviewLevel: 0,
  };
}
