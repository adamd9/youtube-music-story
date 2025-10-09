const express = require('express');
const router = express.Router();
const config = require('../config');
const { generateMusicDoc } = require('../services/musicDoc');
const { dbg } = require('../utils/logger');

// Lightweight documentary generation without Spotify requirements.
// Body: { topic: string, prompt?: string, narrationTargetSecs?: number }
router.post('/api/music-doc-lite', async (req, res) => {
  try {
    if (!config.openai || !config.openai.apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
    }
    const { topic, prompt, narrationTargetSecs } = req.body || {};
    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: 'Missing required field: topic (string)' });
    }

    // Directly generate using LLM without any Spotify catalog
    const data = await generateMusicDoc({
      topic,
      prompt,
      catalog: [],
      narrationTargetSecs
    });

    dbg('music-doc-lite: generated', { topic, segments: Array.isArray(data?.timeline) ? data.timeline.length : 0 });
    return res.json(data);
  } catch (e) {
    console.error('music-doc-lite error', e);
    return res.status(500).json({ error: 'Failed to generate documentary', details: e.message });
  }
});

module.exports = router;
