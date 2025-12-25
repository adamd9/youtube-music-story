const express = require('express');
const router = express.Router();
const config = require('../config');
const { generateMusicPlan, generateNarrationScript, stitchTimeline } = require('../services/musicDoc');
const { generateNarrationAlbumArt } = require('../services/albumArt');
const { mapTrackSlotsToYouTube } = require('../services/youtubeMap');
const { dbg } = require('../utils/logger');

// Lightweight documentary generation (YouTube-only app).
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

    // Fire planner + album art generation in parallel
    const planPromise = generateMusicPlan({ topic, prompt, narrationTargetSecs });
    const artPromise = generateNarrationAlbumArt({ topic });

    const [plan, artResult] = await Promise.all([planPromise, artPromise]);

    const { selections, debug } = await mapTrackSlotsToYouTube(plan?.track_slots || [], { confidenceThreshold: 0.8 });
    const narration = await generateNarrationScript({
      topic,
      summary: plan?.summary || '',
      trackSlots: plan?.track_slots || [],
      selections,
      prompt,
      narrationTargetSecs,
    });

    const data = stitchTimeline({ plan, narration, selections });
    if (artResult && data && Array.isArray(data.timeline)) {
      data.narrationAlbumArtUrl = artResult.publicUrl || artResult.dataUrl;
    }
    data._debug = { plan, mapping: debug };

    dbg('music-doc-lite: generated', { topic, segments: Array.isArray(data?.timeline) ? data.timeline.length : 0 });
    return res.json(data);
  } catch (e) {
    console.error('music-doc-lite error', e);
    return res.status(500).json({ error: 'Failed to generate documentary', details: e.message });
  }
});

module.exports = router;
