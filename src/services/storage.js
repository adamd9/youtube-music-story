const path = require('path');
const fsp = require('fs').promises;
const { dbg } = require('../utils/logger');
const config = require('../config');

const DATA_DIR = config.paths.dataDir;
const PLAYLISTS_DIR = path.join(DATA_DIR, 'playlists');

async function ensureDirs() {
  await fsp.mkdir(PLAYLISTS_DIR, { recursive: true });
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function savePlaylist({ ownerId, title, topic, summary, timeline, source, narrationAlbumArtUrl, _debug }) {
  await ensureDirs();
  const id = genId();
  const createdAt = new Date().toISOString();
  const record = {
    id,
    ownerId,
    title,
    topic,
    summary,
    timeline,
    source: source || null,
    narrationAlbumArtUrl: narrationAlbumArtUrl || null,
    _debug: _debug || undefined,
    createdAt
  };
  const filePath = path.join(PLAYLISTS_DIR, `${id}.json`);
  // Atomic write: write to a unique temp file then rename
  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(record, null, 2));
  await fsp.rename(tmpPath, filePath);
  dbg('storage: saved playlist', { id, ownerId });
  return record;
}

async function getPlaylist(id) {
  await ensureDirs();
  const filePath = path.join(PLAYLISTS_DIR, `${id}.json`);
  // Read with retry/backoff in case a concurrent rename/write just occurred
  const delays = [50, 100, 150, 250, 400];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      const data = await fsp.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      if (e && e.code === 'ENOENT' && attempt < delays.length - 1) {
        await new Promise(res => setTimeout(res, delays[attempt]));
        continue;
      }
      throw e;
    }
  }
}

async function listPlaylistsByOwner(ownerId) {
  await ensureDirs();
  const files = await fsp.readdir(PLAYLISTS_DIR);
  const results = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const content = await fsp.readFile(path.join(PLAYLISTS_DIR, f), 'utf-8');
      const rec = JSON.parse(content);
      if (rec.ownerId === ownerId) {
        results.push(rec);
      }
    } catch {}
  }
  // Sort by updatedAt desc (fallback to createdAt)
  results.sort((a, b) => (
    (b.updatedAt || b.createdAt || '')
  ).localeCompare(
    (a.updatedAt || a.createdAt || '')
  ));
  return results;
}

async function updatePlaylist(id, partial) {
  await ensureDirs();
  const filePath = path.join(PLAYLISTS_DIR, `${id}.json`);
  const data = await fsp.readFile(filePath, 'utf-8').catch(() => null);
  if (!data) return null;
  const current = JSON.parse(data);
  const merged = { ...current, ...partial, updatedAt: new Date().toISOString() };
  // Atomic write: write to a unique temp file then rename
  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(merged, null, 2));
  await fsp.rename(tmpPath, filePath);
  dbg('storage: updated playlist', { id });
  return merged;
}

module.exports = { savePlaylist, getPlaylist, listPlaylistsByOwner, updatePlaylist };
