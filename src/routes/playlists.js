const express = require('express');
const router = express.Router();
const { savePlaylist, getPlaylist, listPlaylistsByOwner, updatePlaylist } = require('../services/storage');
const { mapTimelineToYouTube } = require('../services/youtubeMap');
const { dbg, truncate } = require('../utils/logger');

// Create/save a generated playlist record
// body: { ownerId: string, title: string, topic: string, summary: string, timeline: array, source?: 'youtube' }
router.post('/api/playlists', async (req, res) => {
  try {
    const { ownerId, title, topic, summary, timeline, source, narrationAlbumArtUrl } = req.body || {};
    if (!ownerId || !title || !Array.isArray(timeline)) {
      return res.status(400).json({ error: 'ownerId, title and timeline are required' });
    }
    dbg('playlists:create', { ownerId, title, tcount: timeline.length, source });
    // If this is a YouTube-mode playlist, map songs server-side before saving
    let timelineToSave = timeline;
    if (source === 'youtube') {
      try {
        dbg('playlists:create: mapping to YouTube (server-side)', { songs: timeline.filter(it => it && it.type === 'song').length });
        timelineToSave = await mapTimelineToYouTube(timeline);
        const mappedCount = timelineToSave.filter(it => it && it.type === 'song' && it.youtube && it.youtube.videoId).length;
        dbg('playlists:create: mapped results', { mappedCount });
      } catch (e) {
        console.error('server youtube mapping failed', e);
        return res.status(500).json({ error: 'YouTube mapping failed on server', details: e.message });
      }
    }
    const rec = await savePlaylist({
      ownerId,
      title,
      topic,
      summary,
      timeline: timelineToSave,
      source,
      narrationAlbumArtUrl
    });
    return res.json({ ok: true, playlist: rec });
  } catch (e) {
    console.error('save playlist error', e);
    return res.status(500).json({ error: 'Failed to save playlist' });
  }
});

// Fetch a playlist by id
router.get('/api/playlists/:id', async (req, res) => {
  try {
    dbg('playlists:get', { id: req.params.id });
    const rec = await getPlaylist(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    return res.json({ ok: true, playlist: rec });
  } catch (e) {
    console.error('get playlist error', e);
    return res.status(404).json({ error: 'Not found' });
  }
});

// List playlists for a specific owner
router.get('/api/users/:ownerId/playlists', async (req, res) => {
  try {
    dbg('playlists:list', { ownerId: req.params.ownerId });
    const list = await listPlaylistsByOwner(req.params.ownerId);
    return res.json({ ok: true, playlists: list });
  } catch (e) {
    console.error('list playlists error', e);
    return res.status(500).json({ error: 'Failed to list playlists' });
  }
});

// Update/finalize a playlist (e.g., attach TTS URLs after client generation)
// body: { title?, topic?, summary?, timeline? }
router.patch('/api/playlists/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const partial = req.body || {};
    dbg('playlists:update', { id, keys: Object.keys(partial || {}) });
    const rec = await updatePlaylist(id, partial);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    return res.json({ ok: true, playlist: rec });
  } catch (e) {
    console.error('update playlist error', e);
    return res.status(500).json({ error: 'Failed to update playlist' });
  }
});

module.exports = router;
