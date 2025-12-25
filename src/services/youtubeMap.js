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

async function mapSongToYouTube(item) {
  const title = item.title || item.name || '';
  const artist = item.artist || '';
  const targetDurSec = Number.isFinite(item.duration_ms) ? Math.round(item.duration_ms / 1000) : null;
  const hint = item.youtube_hint || '';
  const q = `${title} ${artist} ${hint}`.trim();
  dbg('youtubeMap: scrape search', { q, targetDurSec });

  try {
    const videos = await YouTube.search(q, { limit: 6 });
    if (!videos || videos.length === 0) {
      dbg('youtubeMap: no videos found', { q });
      return { youtube: { videoId: null, title: null, channelId: null, durationSec: null, matchedConfidence: 0 } };
    }

    const candidates = videos.map(v => ({
      videoId: v.id,
      title: v.title,
      channelId: v.channel && v.channel.id,
      channelTitle: v.channel && v.channel.name,
      durationSec: v.duration ? Math.round(v.duration / 1000) : null
    }));

    let best = null; let bestScore = 0;
    for (const c of candidates) {
      const s = scoreCandidate(c, title, artist, targetDurSec);
      if (s > bestScore) { best = c; bestScore = s; }
    }

    if (!best && candidates.length > 0) {
      best = candidates[0];
      bestScore = 0;
      dbg('youtubeMap: using fallback candidate', { videoId: best.videoId, title: best.title });
    }

    return {
      youtube: best ? {
        videoId: best.videoId,
        title: best.title,
        channelId: best.channelId,
        durationSec: best.durationSec,
        matchedConfidence: Math.round(bestScore * 100) / 100
      } : { videoId: null, title: null, channelId: null, durationSec: null, matchedConfidence: 0 }
    };
  } catch (error) {
    dbg('youtubeMap: scrape error', { q, error: error.message });
    return { youtube: { videoId: null, title: null, channelId: null, durationSec: null, matchedConfidence: 0 } };
  }
}

async function pickBestCandidateWithAlternates(trackSlot, confidenceThreshold = 0.8) {
  const candidates = [trackSlot.primary, ...(Array.isArray(trackSlot.alternates) ? trackSlot.alternates : [])]
    .filter(Boolean);

  let bestCandidate = null;
  let bestScore = -1;
  let chosen = null;
  const attempts = [];

  for (let idx = 0; idx < candidates.length; idx++) {
    const candidate = candidates[idx];
    const mapping = await mapSongToYouTube(candidate);
    const score = mapping.youtube?.matchedConfidence ?? 0;
    attempts.push({
      ...candidate,
      youtube: mapping.youtube,
      candidateIndex: idx,
    });

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = { ...candidate, youtube: mapping.youtube, slot_id: trackSlot.slot_id, selectedFromIndex: idx };
    }

    if (score >= confidenceThreshold && !chosen) {
      chosen = { ...candidate, youtube: mapping.youtube, slot_id: trackSlot.slot_id, selectedFromIndex: idx };
      break;
    }
  }

  return {
    selection: chosen || bestCandidate || { ...trackSlot.primary, slot_id: trackSlot.slot_id, youtube: { videoId: null, matchedConfidence: 0 } },
    attempts,
    fallbackUsed: !chosen,
  };
}

async function mapTrackSlotsToYouTube(trackSlots, { confidenceThreshold = 0.8 } = {}) {
  if (!Array.isArray(trackSlots)) throw new Error('trackSlots must be an array');
  const selections = [];
  const debug = [];

  for (const slot of trackSlots) {
    if (!slot || !slot.primary) continue;
    const { selection, attempts, fallbackUsed } = await pickBestCandidateWithAlternates(slot, confidenceThreshold);
    selections.push(selection);
    debug.push({ slot_id: slot.slot_id, attempts, fallbackUsed });
  }

  return { selections, debug };
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
    if (Array.isArray(item.alternates) && item.alternates.length > 0 && item.slot_id) {
      const { selection } = await pickBestCandidateWithAlternates({
        slot_id: item.slot_id,
        primary: item,
        alternates: item.alternates,
      });
      out.push({ ...selection });
      continue;
    }

    const mapping = await mapSongToYouTube(item);
    out.push({ ...item, youtube: mapping.youtube });
  }
  return out;
}

module.exports = { mapTimelineToYouTube, mapTrackSlotsToYouTube, mapSongToYouTube };
