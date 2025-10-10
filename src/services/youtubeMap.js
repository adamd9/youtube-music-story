const config = require('../config');
const { dbg } = require('../utils/logger');
const YouTube = require('youtube-sr').default;

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
  
  const searchMethod = (config.youtube && config.youtube.searchMethod) || 'scrape';
  dbg('youtubeMap: using search method', { searchMethod });

  if (searchMethod === 'api') {
    return mapTimelineToYouTubeAPI(timeline);
  } else {
    return mapTimelineToYouTubeScrape(timeline);
  }
}

async function mapTimelineToYouTubeAPI(timeline) {
  const apiKey = config.youtube && config.youtube.apiKey;
  if (!apiKey) throw new Error('YouTube API key not configured');

  const out = [];
  for (const item of timeline) {
    if (!item || item.type !== 'song') { out.push(item); continue; }
    const title = item.title || item.name || '';
    const artist = item.artist || '';
    const targetDurSec = Number.isFinite(item.duration_ms) ? Math.round(item.duration_ms / 1000) : null;
    const hint = item.youtube_hint || '';
    // Quote title to bias exact matches; include optional hint
    const q = `${title ? '"' + title + '"' : ''} ${artist} ${hint}`.trim();
    dbg('youtubeMap: API search', { q, targetDurSec });

    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('key', apiKey);
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('maxResults', '6');
    searchUrl.searchParams.set('q', q);
    // Prefer embeddable results to avoid later playback issues
    searchUrl.searchParams.set('videoEmbeddable', 'true');

    const searchResp = await fetch(searchUrl.toString());
    if (!searchResp.ok) {
      let body = '';
      try { body = await searchResp.text(); } catch {}
      dbg('youtubeMap: search failed', { status: searchResp.status, body });
      // If quota exceeded, fail fast so caller returns 500
      if (searchResp.status === 403 && /quota/i.test(body)) {
        throw new Error('YouTube quota exceeded');
      }
      out.push({ ...item, youtube: { videoId: null, title: null, channelId: null, durationSec: null, matchedConfidence: 0 } });
      continue;
    }
    const searchData = await searchResp.json();
    const items = Array.isArray(searchData.items) ? searchData.items : [];
    const ids = items.map(it => it.id && it.id.videoId).filter(Boolean).slice(0, 6);
    if (ids.length === 0) {
      dbg('youtubeMap: no ids found', { q });
      out.push({ ...item, youtube: { videoId: null, title: null, channelId: null, durationSec: null, matchedConfidence: 0 } });
      continue;
    }

    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    videosUrl.searchParams.set('key', apiKey);
    videosUrl.searchParams.set('part', 'contentDetails,snippet');
    videosUrl.searchParams.set('id', ids.join(','));
    const videosResp = await fetch(videosUrl.toString());
    const videosData = videosResp.ok ? await videosResp.json() : { items: [] };
    if (!videosResp.ok) {
      let body = '';
      try { body = await videosResp.text(); } catch {}
      dbg('youtubeMap: videos failed', { status: videosResp.status, body });
      if (videosResp.status === 403 && /quota/i.test(body)) {
        throw new Error('YouTube quota exceeded');
      }
    }
    const candidates = (videosData.items || []).map(v => ({
      videoId: v.id,
      title: v.snippet && v.snippet.title,
      channelId: v.snippet && v.snippet.channelId,
      channelTitle: v.snippet && v.snippet.channelTitle,
      durationSec: parseISODurationToSeconds(v.contentDetails && v.contentDetails.duration)
    }));

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
  }
  return out;
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
