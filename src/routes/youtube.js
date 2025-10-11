const express = require('express');
const router = express.Router();
const { mapTimelineToYouTube } = require('../services/youtubeMap');

// Lightweight health/config endpoint for client
router.get('/api/youtube-config', (_req, res) => {
  res.json({ ok: true, enabled: true });
});

// Map song items in a timeline to YouTube videoIds using web scraping
// Body: { timeline: [{ type: 'song', title, artist, duration_ms? }] }
// Returns: { ok: true, timeline: [...] } with added youtube field per song
router.post('/api/youtube-map-tracks', async (req, res) => {
  try {
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
