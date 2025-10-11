const { dbg } = require('../utils/logger');
const YouTube = require('youtube-sr').default;

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
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
  const ch = (channelTitle || '').toLowerCase();
  if (ch.includes('topic') || ch.includes(targetArtist.toLowerCase())) score += 0.15;
  if (Number.isFinite(targetDurationSec) && Number.isFinite(durationSec)) {
    const diff = Math.abs(durationSec - targetDurationSec);
    if (diff <= 10) score += 0.25;
    else if (diff <= 20) score += 0.15;
  }
  return Math.min(1, score);
}

async function mapTimelineToYouTube(timeline) {
  if (!Array.isArray(timeline)) throw new Error('timeline must be an array');
  
  dbg('youtubeMap: using scrape method');
  return mapTimelineToYouTubeScrape(timeline);
}

async function mapTimelineToYouTubeScrape(timeline) {
  const out = [];
  for (const item of timeline) {
    if (!item || item.type !== 'song') { out.push(item); continue; }
    const title = item.title || item.name || '';
    const artist = item.artist || '';
    const targetDurSec = Number.isFinite(item.duration_ms) ? Math.round(item.duration_ms / 1000) : null;
    const hint = item.youtube_hint || '';
    // Build search query
    const q = `${title} ${artist} ${hint}`.trim();
    dbg('youtubeMap: scrape search', { q, targetDurSec });

    try {
      // Search using youtube-sr with limit of 6 results
      const videos = await YouTube.search(q, { limit: 6 });
      
      if (!videos || videos.length === 0) {
        dbg('youtubeMap: no videos found', { q });
        out.push({ ...item, youtube: { videoId: null, title: null, channelId: null, durationSec: null, matchedConfidence: 0 } });
        continue;
      }

      // Convert youtube-sr results to our candidate format
      const candidates = videos.map(v => ({
        videoId: v.id,
        title: v.title,
        channelId: v.channel && v.channel.id,
        channelTitle: v.channel && v.channel.name,
        durationSec: v.duration ? Math.round(v.duration / 1000) : null // duration is in milliseconds
      }));

      // Score and pick best match
      let best = null; let bestScore = 0;
      for (const c of candidates) {
        const s = scoreCandidate(c, title, artist, targetDurSec);
        if (s > bestScore) { best = c; bestScore = s; }
      }
      
      // Fallback to first candidate if no positive score
      if (!best && candidates.length > 0) {
        best = candidates[0];
        bestScore = 0;
        dbg('youtubeMap: using fallback candidate', { videoId: best.videoId, title: best.title });
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
    } catch (error) {
      dbg('youtubeMap: scrape error', { q, error: error.message });
      // On error, push item without youtube data
      out.push({ ...item, youtube: { videoId: null, title: null, channelId: null, durationSec: null, matchedConfidence: 0 } });
    }
  }
  return out;
}

module.exports = { mapTimelineToYouTube };
