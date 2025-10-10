const express = require('express');
const router = express.Router();
const config = require('../config');
const { mapTimelineToYouTube } = require('../services/youtubeMap');

// Helper: parse ISO 8601 duration (e.g., PT3M45S) into seconds
function parseISODurationToSeconds(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  const s = parseInt(m[3] || '0', 10);
  return h * 3600 + min * 60 + s;
}

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ') // remove bracketed info
    .replace(/[-_]/g, ' ')
    .replace(/taylor'?s version|remaster(ed)?|official video|audio|lyric(s)?|video|hd|hq|\bft\b|\bofficial\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreCandidate({ title, channelTitle, durationSec }, targetTitle, targetArtist, targetDurationSec) {
  let score = 0;
  const nt = normalize(title);
  const nArtist = normalize(targetArtist);
  const nTitle = normalize(targetTitle);
  if (nt.includes(nTitle)) score += 0.6;
  if (nt.includes(nArtist)) score += 0.2;
  // Channel preference
  const ch = (channelTitle || '').toLowerCase();
  if (ch.includes('topic') || ch.includes(targetArtist.toLowerCase())) score += 0.15;
  // Duration tolerance ±10s preferred, ±20s acceptable
  if (Number.isFinite(targetDurationSec) && Number.isFinite(durationSec)) {
    const diff = Math.abs(durationSec - targetDurationSec);
    if (diff <= 10) score += 0.25;
    else if (diff <= 20) score += 0.15;
  }
  return Math.min(1, score);
}

// Lightweight health/config endpoint for client to detect if YouTube is enabled
router.get('/api/youtube-config', (_req, res) => {
  res.json({ ok: true, enabled: !!(config.youtube && config.youtube.apiKey), hasApiKey: !!(config.youtube && config.youtube.apiKey) });
});

// Map song items in a timeline to YouTube videoIds using YouTube Data API v3
// Body: { timeline: [{ type: 'song', title, artist, duration_ms? }] }
// Returns: { ok: true, timeline: [...] } with added youtube field per song
router.post('/api/youtube-map-tracks', async (req, res) => {
  try {
    const apiKey = config.youtube && config.youtube.apiKey;
    if (!apiKey) return res.status(500).json({ error: 'YouTube API key not configured' });
    const { timeline } = req.body || {};
    if (!Array.isArray(timeline)) return res.status(400).json({ error: 'timeline must be an array' });
    const out = await mapTimelineToYouTube(timeline);
    return res.json({ ok: true, timeline: out });
  } catch (e) {
    console.error('youtube-map-tracks error', e);
    return res.status(500).json({ error: 'Failed to map tracks to YouTube' });
  }
});

module.exports = router;
