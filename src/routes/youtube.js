const express = require('express');
const router = express.Router();
const config = require('../config');

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
    if (!Array.isArray(timeline)) {
      return res.status(400).json({ error: 'timeline must be an array' });
    }
    const out = [];
    for (const item of timeline) {
      if (!item || item.type !== 'song') { out.push(item); continue; }
      const title = item.title || '';
      const artist = item.artist || '';
      const targetDurSec = Number.isFinite(item.duration_ms) ? Math.round(item.duration_ms / 1000) : null;
      const q = `${title} ${artist}`.trim();

      // 1) Search
      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
      searchUrl.searchParams.set('key', apiKey);
      searchUrl.searchParams.set('part', 'snippet');
      searchUrl.searchParams.set('type', 'video');
      searchUrl.searchParams.set('maxResults', '6');
      searchUrl.searchParams.set('q', q);

      const searchResp = await fetch(searchUrl.toString());
      if (!searchResp.ok) {
        out.push({ ...item, youtube: { videoId: null, title: null, channelId: null, durationSec: null, matchedConfidence: 0 } });
        continue;
      }
      const searchData = await searchResp.json();
      const items = Array.isArray(searchData.items) ? searchData.items : [];
      const ids = items.map(it => it.id && it.id.videoId).filter(Boolean).slice(0, 6);
      if (ids.length === 0) {
        out.push({ ...item, youtube: { videoId: null, title: null, channelId: null, durationSec: null, matchedConfidence: 0 } });
        continue;
      }

      // 2) Fetch durations
      const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      videosUrl.searchParams.set('key', apiKey);
      videosUrl.searchParams.set('part', 'contentDetails,snippet');
      videosUrl.searchParams.set('id', ids.join(','));
      const videosResp = await fetch(videosUrl.toString());
      const videosData = videosResp.ok ? await videosResp.json() : { items: [] };
      const candidates = (videosData.items || []).map(v => ({
        videoId: v.id,
        title: v.snippet && v.snippet.title,
        channelId: v.snippet && v.snippet.channelId,
        channelTitle: v.snippet && v.snippet.channelTitle,
        durationSec: parseISODurationToSeconds(v.contentDetails && v.contentDetails.duration)
      }));

      // 3) Score and pick best
      let best = null; let bestScore = 0;
      for (const c of candidates) {
        const s = scoreCandidate(c, title, artist, targetDurSec);
        if (s > bestScore) { best = c; bestScore = s; }
      }

      out.push({
        ...item,
        youtube: best ? {
          videoId: best.videoId,
          title: best.title,
          channelId: best.channelId,
          durationSec: best.durationSec,
          matchedConfidence: Math.round(bestScore * 100) / 100
        } : { videoId: null, title: null, channelId: null, durationSec: null, matchedConfidence: 0 }
      });
    }
    return res.json({ ok: true, timeline: out });
  } catch (e) {
    console.error('youtube-map-tracks error', e);
    return res.status(500).json({ error: 'Failed to map tracks to YouTube' });
  }
});

module.exports = router;
