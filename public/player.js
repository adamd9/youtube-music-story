// No-op: external link removed from UI
function updateYouTubeLinkForTrack(_track) { /* removed external link */ }

// Visual switcher: show YouTube player instead of album art for YouTube tracks
function updateVisualForTrack(track) {
    try {
        const isYT = !!(track && track.type === 'youtube');
        if (ytPlayerContainer) ytPlayerContainer.style.display = isYT ? 'block' : 'none';
        if (albumArtElement) albumArtElement.style.display = isYT ? 'none' : 'block';
    } catch {}
}

// Debug toggle via env-configured flag injected by the server at /config.js
// Set CLIENT_DEBUG=1 in your server env to enable verbose logging in the client.
const DEBUG = (() => {
    try {
        const flag = (typeof window !== 'undefined') ? window.CLIENT_DEBUG : undefined;
        return flag === '1' || flag === 1 || flag === true;
    } catch {
        return false;
    }
})();

const DEFAULT_PAGE_TITLE = (() => {
    try { return (typeof document !== 'undefined' && document.title) ? document.title : 'Music Story'; } catch { return 'Music Story'; }
})();

function setPageTitleForPlaylist(title) {
    try {
        if (typeof document === 'undefined') return;
        const safeTitle = (title && typeof title === 'string') ? title.trim() : '';
        document.title = safeTitle ? `Music Story - ${safeTitle}` : DEFAULT_PAGE_TITLE;
    } catch {}
}

// Play a YouTube track
async function playYouTubeTrack(track) {
    try {
        // Pause local audio
        if (narrationAudio) {
            try { narrationAudio.pause(); } catch (_) {}
        }

        if (!state.ytPlayer || typeof state.ytPlayer.loadVideoById !== 'function') {
            showError('YouTube player not ready. Ensure the IFrame API loaded.');
            return;
        }

        if (track.youtube && track.youtube.videoId) {
            const startSeconds = 0;
            state.ytPlayer.loadVideoById({ videoId: track.youtube.videoId, startSeconds });
            state.ytPlayer.playVideo();
            state.isPlaying = true;
            // Update external link button
            updateYouTubeLinkForTrack(track);
            updateVisualForTrack(track);
            // Duration from mapping if available
            if (Number.isFinite(track.youtube.durationSec)) {
                state.duration = track.youtube.durationSec * 1000;
                try {
                    if (!track.duration || track.duration === 0) {
                        track.duration = state.duration;
                        renderPlaylist();
                    }
                } catch {}
                updateNowPlaying({ duration: state.duration });
            }
        } else {
            showError('No YouTube mapping for this track');
            updateYouTubeLinkForTrack(null);
            updateVisualForTrack(null);
        }

        updatePlayPauseButton();
    } catch (e) {
        console.error('Error playing YouTube track:', e);
        showError('Failed to play YouTube track');
    }
}

// (Client-side YouTube mapping removed; server maps during playlist creation)

function clearAccessToken(reason) {
    state.accessToken = null;
    dbg('cleared access token', { reason });
    try { if (playerSection) playerSection.classList.remove('hidden'); if (loginSection) loginSection.classList.add('hidden'); } catch {}
}


// Show an empty state when no playlist is available
function showEmptyState(message) {
    try { if (docStatusEl) docStatusEl.textContent = message || 'No playlist loaded.'; } catch {}
    try {
        if (trackNameElement) trackNameElement.textContent = 'No playlist loaded';
        if (artistNameElement) artistNameElement.textContent = '—';
        if (albumArtElement) albumArtElement.src = DEFAULT_ALBUM_ART;
        if (progressBar) progressBar.style.width = '0%';
        if (currentTimeElement) currentTimeElement.textContent = '0:00';
        if (durationElement) durationElement.textContent = '0:00';
    } catch {}
    setPageTitleForPlaylist('');
    try {
        if (playlistElement) playlistElement.innerHTML = '<li class="placeholder">No items. Generate an outline or import a playlist to begin.</li>';
    } catch {}
    // Hide all player sections in empty state
    setPlayerSectionsVisible(false);
}

const dbg = (...args) => { if (DEBUG) console.log('[DBG]', ...args); };

// Explicit mode logger for quick diagnostics
function logMode(context) {
    try {
        const m = state && state.mode ? String(state.mode) : '(unset)';
        console.log(`[MODE] ${context || 'info'}:`, m);
    } catch (e) {
        // no-op
    }
}

// Local Storage Management for User's Own Playlists
const LOCAL_STORAGE_KEY = 'musicStoryMyPlaylists';

function getMyPlaylistsFromStorage() {
    try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error('Failed to read playlists from localStorage', e);
        return [];
    }
}

function saveMyPlaylistToStorage(playlistId) {
    try {
        const existing = getMyPlaylistsFromStorage();
        // Add to beginning if not already present
        if (!existing.includes(playlistId)) {
            existing.unshift(playlistId);
            // Keep only last 50 playlists
            const trimmed = existing.slice(0, 50);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(trimmed));
        }
    } catch (e) {
        console.error('Failed to save playlist to localStorage', e);
    }
}

function removeMyPlaylistFromStorage(playlistId) {
    try {
        const existing = getMyPlaylistsFromStorage();
        const filtered = existing.filter(id => id !== playlistId);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {
        console.error('Failed to remove playlist from localStorage', e);
    }
}

// My Playlists rendering (from local storage)
async function refreshMyPlaylists() {
    dbg('refreshMyPlaylists: loading from localStorage');
    try {
        const myPlaylistIds = getMyPlaylistsFromStorage();
        
        if (myPlaylistsList) myPlaylistsList.innerHTML = '';
        
        if (!myPlaylistIds.length) {
            if (myPlaylistsEmpty) myPlaylistsEmpty.classList.remove('hidden');
            return;
        }
        
        if (myPlaylistsEmpty) myPlaylistsEmpty.classList.add('hidden');
        
        // Fetch each playlist from server
        const playlists = [];
        for (const id of myPlaylistIds) {
            try {
                const r = await fetch(`/api/playlists/${encodeURIComponent(id)}`);
                if (r.ok) {
                    const json = await r.json();
                    if (json?.playlist) playlists.push(json.playlist);
                }
            } catch (e) {
                console.error(`Failed to fetch playlist ${id}`, e);
            }
        }
        
        dbg('refreshMyPlaylists: loaded', { count: playlists.length });
        
        if (!playlists.length) {
            if (myPlaylistsEmpty) myPlaylistsEmpty.classList.remove('hidden');
            return;
        }
        
        // Show playlists
        playlists.forEach(rec => {
            const li = document.createElement('li');
            const title = rec.title || '(untitled)';
            const meta = rec.topic ? `(<span class="saved-meta-topic">${rec.topic}</span>)` : '';
            li.innerHTML = `
                <div class="saved-item">
                    <button class="saved-title as-link" data-id="${rec.id}" title="Load playlist">
                        ${title} <span class="saved-meta">${meta}</span>
                    </button>
                </div>`;
            myPlaylistsList.appendChild(li);
        });
        
        // Attach events: click title to load playlist
        myPlaylistsList.querySelectorAll('.saved-title.as-link[data-id]').forEach(el => {
            el.addEventListener('click', async () => {
                const id = el.getAttribute('data-id');
                if (loadIdInput) loadIdInput.value = id;
                if (loadIdBtn) loadIdBtn.click();
            });
        });
        
    } catch (e) {
        console.error('refreshMyPlaylists error', e);
        if (myPlaylistsEmpty) {
            myPlaylistsEmpty.classList.remove('hidden');
            myPlaylistsEmpty.textContent = 'Failed to load playlists.';
        }
    }
}

// All Playlists rendering (from server - all anonymous playlists)
async function refreshAllPlaylists() {
    dbg('refreshAllPlaylists: loading from server');
    try {
        const r = await fetch('/api/users/anonymous/playlists');
        const json = r.ok ? await r.json() : { playlists: [] };
        const playlists = Array.isArray(json?.playlists) ? json.playlists : [];
        
        if (allPlaylistsList) allPlaylistsList.innerHTML = '';
        
        if (!playlists.length) {
            if (allPlaylistsEmpty) allPlaylistsEmpty.classList.remove('hidden');
            return;
        }
        
        if (allPlaylistsEmpty) allPlaylistsEmpty.classList.add('hidden');
        
        // Show up to 10 most recent
        playlists.slice(0, 10).forEach(rec => {
            const li = document.createElement('li');
            const title = rec.title || '(untitled)';
            const meta = rec.topic ? `(<span class="saved-meta-topic">${rec.topic}</span>)` : '';
            li.innerHTML = `
                <div class="saved-item">
                    <button class="saved-title as-link" data-id="${rec.id}" title="Load playlist">
                        ${title} <span class="saved-meta">${meta}</span>
                    </button>
                </div>`;
            allPlaylistsList.appendChild(li);
        });
        
        // Attach events
        allPlaylistsList.querySelectorAll('.saved-title.as-link[data-id]').forEach(el => {
            el.addEventListener('click', async () => {
                const id = el.getAttribute('data-id');
                if (loadIdInput) loadIdInput.value = id;
                if (loadIdBtn) loadIdBtn.click();
            });
        });
        
    } catch (e) {
        console.error('refreshAllPlaylists error', e);
        if (allPlaylistsEmpty) {
            allPlaylistsEmpty.classList.remove('hidden');
            allPlaylistsEmpty.textContent = 'Failed to load playlists.';
        }
    }
}

// (moved) We attach listeners and refresh after DOM elements are defined below

// Save generated playlist record to server for sharing and history
async function saveGeneratedPlaylist(doc, ownerId) {
    try {
        if (!doc || !Array.isArray(doc.timeline)) return null;
        const body = {
            ownerId: ownerId || 'anonymous',
            title: doc.title || (doc.topic ? `Music history: ${doc.topic}` : 'Music history'),
            topic: doc.topic || '',
            summary: doc.summary || '',
            timeline: doc.timeline
        };
        const r = await fetch('/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!r.ok) return null;
        const json = await r.json();
        const playlist = json?.playlist || null;
        
        // Save to local storage for "My Playlists"
        if (playlist && playlist.id) {
            saveMyPlaylistToStorage(playlist.id);
            // Refresh both lists
            refreshMyPlaylists();
            refreshAllPlaylists();
        }
        
        return playlist;
    } catch (e) {
        console.error('saveGeneratedPlaylist error', e);
        return null;
    }
}


// Generate TTS for narration segments and attach URLs onto the doc (timeline or legacy)
async function generateTTSForDoc(doc, playlistId) {
    try {
        if (!doc) return doc;
        let texts = [];
        let targets = [];
        if (Array.isArray(doc.timeline)) {
            doc.timeline.forEach((entry) => {
                if (entry && entry.type === 'narration' && typeof entry.text === 'string' && entry.text.trim().length > 0) {
                    texts.push({ text: entry.text.trim() });
                    targets.push(entry);
                }
            });
        } else if (Array.isArray(doc.narration_segments)) {
            doc.narration_segments.forEach((seg) => {
                if (seg && typeof seg.text === 'string' && seg.text.trim().length > 0) {
                    texts.push({ text: seg.text.trim() });
                    targets.push(seg);
                }
            });
        }

        if (texts.length === 0) {
            dbg('generateTTSForDoc: no narration segments found');
            return doc;
        }

        dbg('generateTTSForDoc: requesting TTS batch', { count: texts.length });
        try { if (docStatusEl) docStatusEl.textContent = `Generating ${texts.length} narration tracks (this may take a minute)…`; } catch {}
        const resp = await fetch('/api/tts-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ segments: texts, playlistId })
        });
        if (!resp.ok) {
            let details = {};
            try { details = await resp.json(); } catch {}
            dbg('generateTTSForDoc: tts-batch failed', { status: resp.status, details });
            try { if (docStatusEl) docStatusEl.textContent = 'Narration generation failed.'; } catch {}
            showError('Narration generation failed. Please try again.');
            return doc;
        }
        const json = await resp.json();
        const urls = Array.isArray(json?.urls) ? json.urls : [];
        dbg('generateTTSForDoc: received urls', { total: urls.length });
        try { if (docStatusEl) docStatusEl.textContent = `Narration complete (${urls.length} tracks)…`; } catch {}

        let i = 0;
        for (const target of targets) {
            const url = urls[i++] || null;
            if (url) {
                target.tts_url = url;
            }
        }

        try { if (docStatusEl) docStatusEl.textContent = 'Narration tracks ready.'; } catch {}
        return doc;
    } catch (e) {
        console.error('generateTTSForDoc error', e);
        try { if (docStatusEl) docStatusEl.textContent = 'Narration generation failed.'; } catch {}
        showError('Narration generation failed. Please try again.');
        return doc;
    }
}

// Player state (YouTube-only)
const state = {
    audioContext: null,
    audioSource: null,
    gainNode: null,
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.5,
    playlist: [],
    currentTrackIndex: 0,
    // YouTube IFrame Player instance (when initialized)
    ytPlayer: null,
    isInitialized: false,
    isGeneratingDoc: false,
    startedTrackIndex: -1,
    loadedPlaylistId: null,
    lastDoc: null,
    // Section clip control (seconds)
    sectionClipSeconds: 30,
    uiBound: false
};

// No credentials management in YouTube-only mode

function saveCustomCredentials(clientId, clientSecret) {
    const creds = { clientId, clientSecret };
    localStorage.setItem(CUSTOM_CREDS_KEY, JSON.stringify(creds));
    return creds;
}

function clearCustomCredentials() {
    localStorage.removeItem(CUSTOM_CREDS_KEY);
}

function hasCustomCredentials() {
    const creds = getCustomCredentials();
    return creds && creds.clientId && creds.clientSecret;
}

// Get redirect URI (always /callback on current origin)

// Get active credentials (custom or default from server)
async function getActiveCredentials() {
    const custom = getCustomCredentials();
    if (custom && custom.clientId && custom.clientSecret) {
        return custom;
    }
    // Fallback to server config
    try {
        const resp = await fetch('/api/config');
        if (resp.ok) {
            const config = await resp.json();
            return {
                clientId: config.clientId,
                clientSecret: null // Server doesn't expose secret
            };
        }
    } catch {}
    return null;
}

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Initialize theme on load
initTheme();

// DOM Elements
const loginSection = document.getElementById('login');
const playerSection = document.getElementById('player');
const loginButton = document.getElementById('login-button');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const playPauseButton = document.getElementById('play-pause');
const previousButton = document.getElementById('previous');
const nextButton = document.getElementById('next');
const progressBar = document.getElementById('progress-bar');
const currentTimeElement = document.getElementById('current-time');
const durationElement = document.getElementById('duration');
const volumeControl = document.getElementById('volume');
const trackNameElement = document.getElementById('track-name');
const artistNameElement = document.getElementById('artist-name');
const albumArtElement = document.getElementById('album-art');
const playlistElement = document.getElementById('playlist');
const errorElement = document.getElementById('error');
const localBadgeElement = document.getElementById('local-badge');

// Player section containers
const docMetaEl = document.querySelector('#player .doc-meta');
const nowPlayingEl = document.querySelector('#player .now-playing');
const controlsEl = document.querySelector('#player .controls');
const volumeEl = document.querySelector('#player .volume-control');
const playlistWrapEl = document.querySelector('#player .playlist');

function setPlayerSectionsVisible(visible) {
    const method = visible ? 'remove' : 'add';
    // Also toggle the entire player container
    try { if (playerSection) playerSection.classList[method]('hidden'); } catch {}
    try { if (docMetaEl) docMetaEl.classList[method]('hidden'); } catch {}
    try { if (nowPlayingEl) nowPlayingEl.classList[method]('hidden'); } catch {}
    try { if (controlsEl) controlsEl.classList[method]('hidden'); } catch {}
    try { if (volumeEl) volumeEl.classList[method]('hidden'); } catch {}
    try { if (playlistWrapEl) playlistWrapEl.classList[method]('hidden'); } catch {}
}

// Documentary generation UI elements (index page)
const docTopicInput = document.getElementById('doc-topic');
const generateDocBtn = document.getElementById('generate-doc');
const docOutputEl = document.getElementById('doc-output');
const sectionDurationSelect = document.getElementById('section-duration');
const saveStatusEl = document.getElementById('save-status');
const loadIdInput = document.getElementById('load-id-input');
const loadIdBtn = document.getElementById('load-id-btn');
const shareBtn = document.getElementById('share-btn');
const myPlaylistsList = document.getElementById('my-playlists-list');
const myPlaylistsEmpty = document.getElementById('my-playlists-empty');
const allPlaylistsList = document.getElementById('all-playlists-list');
const allPlaylistsEmpty = document.getElementById('all-playlists-empty');
const refreshMyPlaylistsBtn = document.getElementById('refresh-my-playlists');
const docSpinner = document.getElementById('doc-spinner');
const docSpinnerText = document.getElementById('doc-spinner-text');
const docStatusEl = document.getElementById('doc-status');
const docRawDetails = document.getElementById('doc-raw');
// Doc meta fields in player UI
const docTitleDisplay = document.getElementById('doc-title');
const docTopicDisplay = document.getElementById('doc-topic-display');
const docSummaryDisplay = document.getElementById('doc-summary');
// Playlist header in player
const playlistHeader = document.getElementById('playlist-header');
const playlistTitleDisplay = document.getElementById('playlist-title-display');
const playlistTopicDisplay = document.getElementById('playlist-topic-display');
// Import modal elements
const importOpenBtn = document.getElementById('import-open-btn');
const importModal = document.getElementById('import-modal');
const importCancelBtn = document.getElementById('import-cancel-btn');

// Settings modal elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const customClientIdInput = document.getElementById('custom-client-id');
const customClientSecretInput = document.getElementById('custom-client-secret');
const customRedirectUriInput = document.getElementById('custom-redirect-uri');
const saveCredentialsBtn = document.getElementById('save-credentials-btn');
const clearCredentialsBtn = document.getElementById('clear-credentials-btn');
const openSettingsFromDenied = document.getElementById('open-settings-from-denied');
// Mode toggle and YouTube elements
const modeSelect = document.getElementById('mode-select');
const ytPlayerContainer = document.getElementById('yt-player-container');
const ytPlayerHost = document.getElementById('youtube-player');
const openYouTubeBtn = document.getElementById('open-youtube-btn');
const ytLinkHint = document.getElementById('yt-link-hint');

// Built-in default album art (inline SVG, dark gray square with music note)
const DEFAULT_ALBUM_ART = 'data:image/svg+xml;utf8,\
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">\
<rect width="300" height="300" fill="%23282828"/>\
<g fill="%23B3B3B3">\
<circle cx="110" cy="200" r="28"/>\
<circle cx="170" cy="220" r="22"/>\
<path d="M190 80v100h-10V100l-60 15v65h-10V105l80-20z"/>\
</g>\
</svg>';

// HTMLAudioElement for narration/local playback (iOS friendly)
const narrationAudio = document.getElementById('narration-audio');
if (narrationAudio) {
    narrationAudio.volume = state.volume;
}

// Mode persistence utilities
const MODE_STORAGE_KEY = 'playback_mode';
function getInitialMode() {
    // For now we force YouTube mode and ignore URL/localStorage
    return 'youtube';
}
function persistMode(mode) {
    try { localStorage.setItem(MODE_STORAGE_KEY, mode); } catch {}
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', mode);
        window.history.replaceState({}, '', url.toString());
    } catch {}
}
function applyModeToUI() {
    // Default: hide YouTube player visual until a YouTube track is active
    try { if (ytPlayerContainer) ytPlayerContainer.style.display = 'none'; } catch {}
}

function applyModeLayoutVisibility() {
    try { if (playerSection) playerSection.classList.remove('hidden'); } catch {}
}

// Initialize mode early (UI application will occur after DOM elements are bound)
state.mode = getInitialMode();
logMode('startup');
applyModeToUI(state.mode);
// Apply layout now that mode is set
applyModeLayoutVisibility();

// Ensure transport buttons work in all modes
if (!state.uiBound) {
    if (playPauseButton) playPauseButton.addEventListener('click', togglePlayPause);
    if (previousButton) previousButton.addEventListener('click', playPrevious);
    if (nextButton) nextButton.addEventListener('click', playNext);
    state.uiBound = true;
}

// Mode selector removed (YouTube-only)

// Robust YouTube init with retries (handles API arriving before/after our script)
let ytInitAttempts = 0;
async function ensureYouTubePlayerReady() {
    try {
        if (state.ytPlayer) return true;
        if (!ytPlayerHost) return false; // DOM not ready
        if (typeof YT === 'undefined' || !YT || !YT.Player) {
            // Retry a few times briefly
            if (ytInitAttempts++ < 10) {
                return await new Promise(res => setTimeout(() => res(ensureYouTubePlayerReady()), 150));
            }
            return false;
        }
        state.ytPlayer = new YT.Player('youtube-player', {
            height: '225',
            width: '400',
            videoId: '',
            playerVars: { autoplay: 0, controls: 1, rel: 0, modestbranding: 1, playsinline: 1 },
            events: {
                onReady: () => { dbg('YouTube player ready'); },
                onStateChange: (ev) => {
                    if (!ev || typeof YT === 'undefined') return;
                    if (ev.data === YT.PlayerState.ENDED) {
                        if (state.currentTrack && state.currentTrack.type === 'youtube') {
                            playNext();
                        }
                    }
                }
            }
        });
        dbg('YouTube IFrame API initialized');
        return true;
    } catch (e) {
        console.error('YouTube init error', e);
        return false;
    }
}

// YouTube IFrame API init (global callback)
window.onYouTubeIframeAPIReady = function() {
    ensureYouTubePlayerReady();
};

// Build playlist from documentary JSON (supports both legacy structure + new timeline)
function buildPlaylistFromDoc(doc) {
    try {
        // persist the raw doc so we can PATCH mappings later
        state.lastDoc = doc || null;
        const newPlaylist = [];
        const narrationAlbumArt = (doc && (doc.narrationAlbumArtUrl || doc.narration_album_art_url)) || null;

        if (doc && Array.isArray(doc.timeline)) {
            // New format: single interleaved timeline array
            let narrationCount = 0;
            doc.timeline.forEach((entry) => {
                if (!entry || !entry.type) return;
                if (entry.type === 'narration') {
                    narrationCount += 1;
                    const ttsUrl = entry.tts_url || entry.ttsUrl || entry.url;
                    if (!ttsUrl) {
                        showError('Narration audio missing for one or more segments. Please retry generation.');
                        return; // skip adding this narration segment
                    }
                    const narrationTitle = entry.title || `Narration ${narrationCount}`;
                    const entryAlbumArt = entry.albumArt
                        || entry.album_art
                        || entry.albumArtUrl
                        || entry.album_art_url
                        || narrationAlbumArt
                        || DEFAULT_ALBUM_ART;
                    newPlaylist.push({
                        type: 'mp3',
                        id: `narration-${narrationCount - 1}`,
                        name: narrationTitle,
                        artist: 'Narrator',
                        albumArt: entryAlbumArt,
                        duration: 0,
                        url: ttsUrl,
                        narrationText: entry.text || ''
                    });
                } else if (entry.type === 'song') {
                    const title = entry.title || '';
                    const artist = entry.artist || '';
                    const uri = entry.track_uri || null;
                    // If pre-mapped YouTube video is present, prefer YouTube immediately in YouTube mode
                    if (entry.youtube && entry.youtube.videoId) {
                        newPlaylist.push({
                            type: 'youtube',
                            id: `youtube:${entry.youtube.videoId}`,
                            name: title,
                            artist: artist,
                            albumArt: '',
                            duration: Number.isFinite(entry.youtube.durationSec) ? entry.youtube.durationSec * 1000 : 0,
                            youtube: entry.youtube
                        });
                    } else {
                        // Create a placeholder YouTube item; mapping will fill youtube field
                        newPlaylist.push({
                            type: 'youtube',
                            id: null,
                            name: title,
                            artist: artist,
                            albumArt: '',
                            duration: 0,
                            youtube: null
                        });
                    }
                }
            });
        } else if (doc && Array.isArray(doc.structure) && Array.isArray(doc.tracks) && Array.isArray(doc.narration_segments)) {
            // Legacy format fallback
            doc.structure.forEach((item) => {
                if (item.type === 'narration') {
                    const seg = doc.narration_segments[item.narration_index];
                    if (!seg) return;
                    const ttsUrl = seg.tts_url || seg.ttsUrl || seg.url;
                    if (!ttsUrl) {
                        showError('Narration audio missing for one or more segments. Please retry generation.');
                        return; // skip adding this narration segment
                    }
                    const narrationTitle = seg.title || `Narration ${item.narration_index + 1}`;
                    const segAlbumArt = seg.albumArt
                        || seg.album_art
                        || seg.albumArtUrl
                        || seg.album_art_url
                        || narrationAlbumArt
                        || DEFAULT_ALBUM_ART;
                    newPlaylist.push({
                        type: 'mp3',
                        id: `narration-${item.narration_index}`,
                        name: narrationTitle,
                        artist: 'Narrator',
                        albumArt: segAlbumArt,
                        duration: 0,
                        url: ttsUrl,
                        narrationText: seg.text
                    });
                } else if (item.type === 'song') {
                    const tr = doc.tracks[item.track_index];
                    if (!tr) return;
                    const searchName = tr.title || '';
                    const searchArtist = tr.artist || '';
                    const trackUri = tr.track_uri || null;
                    newPlaylist.push({
                        type: 'youtube',
                        id: null,
                        name: searchName,
                        artist: searchArtist,
                        albumArt: '',
                        duration: 0,
                        youtube: null
                    });
                }
            });
        } else {
            throw new Error('Invalid documentary structure');
        }

        if (newPlaylist.length === 0) throw new Error('Empty generated playlist');

        state.playlist = newPlaylist;
        state.currentTrackIndex = 0;
        state.currentTrack = state.playlist[0];
        state.startedTrackIndex = -1; // nothing played yet
        renderPlaylist();
        setPlayerSectionsVisible(true);
        
        // Show playlist title in player header
        if (playlistHeader && playlistTitleDisplay && playlistTopicDisplay) {
            const title = doc.title || 'Music Documentary';
            const topic = doc.topic || '';
            playlistTitleDisplay.textContent = title;
            playlistTopicDisplay.textContent = topic;
            playlistHeader.classList.remove('hidden');
            setPageTitleForPlaylist(title);
        }
        
        // Try to load durations for local MP3s to show in the playlist
        preloadTrackDurations();
        updateNowPlaying({
            name: state.currentTrack.name,
            artist: state.currentTrack.artist,
            albumArt: state.currentTrack.albumArt,
            duration: state.currentTrack.duration,
            position: 0,
            isPlaying: false
        });
        // No autoplay: require a user gesture (click Play or choose a track)
        
        // Mapping is handled server-side during playlist creation

    } catch (e) {
        console.error('Failed to build playlist from doc:', e);
        showError('Failed to build playlist from generated outline');
    }
}

// Remove activeJobs UI block
// UI Event Listeners
// Parse URL hash (no-op in YouTube-only)
async function parseHash() { state.accessToken = null; }

// Initialize the player (YouTube + narration only)
async function initPlayer() {
    if (state.isInitialized) return;
    try {
        // Set up Web Audio API for local MP3 playback
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        state.gainNode = state.audioContext.createGain();
        state.gainNode.gain.value = state.volume;

        // Bind UI
        setupEventListeners();
        try { if (loginSection) loginSection.classList.add('hidden'); if (playerSection) playerSection.classList.remove('hidden'); } catch {}
        state.isInitialized = true;
    } catch (error) {
        console.error('Error initializing player:', error);
        showError('Failed to initialize player. Please try again.');
    }
}

// Set up event listeners
function setupEventListeners() {
    // UI Event Listeners (YouTube + narration)
    // No login/auth handlers in YouTube-only mode
    
    // Note: We also bind these globally below for YouTube mode; guard against double-binding
    if (!state.uiBound) {
        if (playPauseButton) playPauseButton.addEventListener('click', togglePlayPause);
        if (previousButton) previousButton.addEventListener('click', playPrevious);
        if (nextButton) nextButton.addEventListener('click', playNext);
        state.uiBound = true;
    }
    
    // Progress bar click
    const progressContainer = document.querySelector('.progress-container');
    progressContainer.addEventListener('click', (e) => {
        if (!state.duration) return;
        
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const seekTime = pos * state.duration;
        dbg('seek', { pos, seekTimeMs: seekTime });
        // Seek based on current track type
        if (state.currentTrack && state.currentTrack.type === 'youtube') {
            try { if (state.ytPlayer && typeof state.ytPlayer.seekTo === 'function') state.ytPlayer.seekTo(Math.max(0, seekTime / 1000), true); } catch {}
        } else {
            // For local MP3, restart at the new offset
            try { resumeLocalAt(seekTime / 1000); } catch {}
        }
    });
    
    // Volume control
    volumeControl.addEventListener('input', (e) => {
        const volume = e.target.value / 100;
        state.volume = volume;
        
        if (state.gainNode) {
            state.gainNode.gain.value = volume;
        }
        if (narrationAudio) {
            narrationAudio.volume = volume;
        }
    });
    
    // Update progress bar
    requestAnimationFrame(updateProgress);
}

// No-op in YouTube-only mode
async function transferPlaybackHere(_deviceId) { return; }

// Legacy hard-coded default playlist was removed to avoid overriding loaded/generated playlists

// Render the playlist in the UI
function renderPlaylist() {
    playlistElement.innerHTML = '';
    
    state.playlist.forEach((track, index) => {
        const li = document.createElement('li');
        li.className = index === state.currentTrackIndex ? 'playing' : '';
        const dur = (track && track.duration && track.duration > 0) ? formatTime(track.duration) : '';
        const durHtml = dur ? `<span class="track-duration">${dur}</span>` : '';
        li.innerHTML = `
            <span class="track-number">${index + 1}</span>
            <div class="track-info">
                <div class="track-title">${track.name}</div>
                <div class="track-artist">${track.artist}</div>
            </div>
            <div class="badges">
                ${durHtml}
            </div>
        `;
        
        li.addEventListener('click', () => {
            dbg('playlist click', { index, track });
            playTrack(index);
        });
        
        playlistElement.appendChild(li);
    });
}

// Preload durations for local MP3 tracks so playlist can display them
function preloadTrackDurations() {
    try {
        state.playlist.forEach((t, idx) => {
            if (!t || t.type !== 'mp3' || !t.url || t.duration > 0) return;
            const a = new Audio();
            a.preload = 'metadata';
            a.src = t.url;
            a.onloadedmetadata = () => {
                const d = (isFinite(a.duration) && a.duration > 0) ? Math.floor(a.duration * 1000) : 0;
                if (d > 0) {
                    // Update track duration and refresh playlist UI
                    t.duration = d;
                    renderPlaylist();
                }
            };
            // Best effort; ignore errors
            a.onerror = () => {};
        });
    } catch {}
}

// Play a specific track by index
async function playTrack(index) {
    if (index < 0 || index >= state.playlist.length) return;
    
    // No section-based clipping; timers are not used

    state.currentTrackIndex = index;
    state.currentTrack = state.playlist[index];
    state.startedTrackIndex = index;
    dbg('playTrack', { index, track: state.currentTrack });
    logMode('playTrack');
    // Keep external YouTube link in sync with the selected item
    updateYouTubeLinkForTrack(state.currentTrack);
    updateVisualForTrack(state.currentTrack);
    
    // Update UI
    updateNowPlaying({
        name: state.currentTrack.name,
        artist: state.currentTrack.artist,
        albumArt: state.currentTrack.albumArt,
        duration: state.currentTrack.duration,
        position: 0,
        isPlaying: true
    });
    
    // Play the track based on its type (YouTube or local MP3)
    if (state.currentTrack.type === 'mp3') {
        await playLocalMP3(state.currentTrack);
    } else if (state.currentTrack.type === 'youtube') {
        const ok = await ensureYouTubePlayerReady();
        if (!ok) {
            showError('YouTube player not ready. Please try again in a moment.');
            return;
        }
        await playYouTubeTrack(state.currentTrack);
    }
    
    // Update playlist UI
    renderPlaylist();
}


// Play a local MP3 file
async function playLocalMP3(track) {
    try {
        // Pause YouTube if active
        if (state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') {
            try { state.ytPlayer.pauseVideo(); } catch (_) {}
        }
        // Stop any WebAudio source
        if (state.audioSource) {
            try { state.audioSource.onended = null; } catch (_) {}
            try { state.audioSource.stop(); } catch (_) {}
            state.audioSource = null;
        }
        if (narrationAudio) {
            narrationAudio.src = track.url;
            narrationAudio.currentTime = 0;
            narrationAudio.volume = state.volume;
            narrationAudio.onended = () => playNext();
            await narrationAudio.play();
        }
        state.audioStartTime = Date.now();
        state.audioPauseTime = undefined;
        state.isPlaying = true;
        updatePlayPauseButton();
        // We do not know duration until metadata loads; update when available
        if (narrationAudio) {
            if (isFinite(narrationAudio.duration) && narrationAudio.duration > 0) {
                state.duration = narrationAudio.duration * 1000;
            }
            narrationAudio.onloadedmetadata = () => {
                state.duration = narrationAudio.duration * 1000;
                // Persist duration onto the track for playlist display
                try {
                    if (state.currentTrack && (!state.currentTrack.duration || state.currentTrack.duration === 0)) {
                        state.currentTrack.duration = state.duration;
                        renderPlaylist();
                    }
                } catch {}
                updateNowPlaying({ duration: state.duration });
            };
        }
        updateNowPlaying({ position: 0, isPlaying: true });
        // Media Session metadata for iOS lockscreen
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.name || 'Narration',
                    artist: track.artist || 'Narrator',
                    artwork: [{ src: track.albumArt || DEFAULT_ALBUM_ART, sizes: '300x300', type: 'image/png' }]
                });
                navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
                navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
                navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
                navigator.mediaSession.setActionHandler('previoustrack', () => playPrevious());
            } catch {}
        }
    } catch (error) {
        // Browsers may block autoplay until the user interacts with the page.
        const msg = (error && error.name) ? String(error.name) : '';
        if (msg === 'NotAllowedError') {
            try { state.isPlaying = false; } catch {}
            updatePlayPauseButton();
            showError('Press Play to start audio (browser requires a user interaction).');
            return;
        }
        console.error('Error playing MP3 (element):', error);
        showError('Failed to play MP3');
    }
}

// Toggle play/pause
function togglePlayPause() {
    if (!state.currentTrack) return;
    
    // Handle by track type
    if (state.currentTrack.type === 'youtube') {
        if (!state.ytPlayer || typeof state.ytPlayer.playVideo !== 'function' || typeof state.ytPlayer.pauseVideo !== 'function') {
            showError('YouTube player not ready.');
            return;
        }
        if (state.isPlaying) {
            dbg('toggle pause: YouTube');
            try { state.ytPlayer.pauseVideo(); } catch {}
            state.isPlaying = false;
        } else {
            dbg('toggle resume: YouTube');
            try { state.ytPlayer.playVideo(); } catch {}
            state.isPlaying = true;
        }
    } else {
        // Local MP3 (narration)
        if (state.isPlaying) {
            if (narrationAudio) {
                dbg('toggle pause: local MP3 (element)');
                narrationAudio.pause();
                state.audioPauseTime = Date.now();
            }
            state.isPlaying = false;
        } else {
            if (narrationAudio && narrationAudio.src) {
                dbg('toggle resume: local MP3 (element)');
                narrationAudio.play();
            } else if (state.currentTrack && state.currentTrack.url) {
                // No src set yet, start fresh
                playLocalMP3(state.currentTrack);
            }
            state.isPlaying = true;
        }
    }
    
    updatePlayPauseButton();
}


// Resume local audio at a given offset in seconds
function resumeLocalAt(offsetSeconds) {
    if (!state.currentTrack || state.currentTrack.type !== 'mp3' || !narrationAudio) return;
    try {
        narrationAudio.currentTime = Math.max(0, offsetSeconds);
        narrationAudio.play();
        state.audioStartTime = Date.now() - Math.floor(offsetSeconds * 1000);
        state.audioPauseTime = undefined;
    } catch (err) {
        console.error('Error resuming MP3 (element):', err);
        showError('Failed to seek MP3');
    }
}

function stopAtEndOfPlaylist() {
    try {
        state.isPlaying = false;
        updatePlayPauseButton();
    } catch {}
    // Best-effort stop of whichever player is active
    try {
        if (state.currentTrack && state.currentTrack.type === 'youtube') {
            if (state.ytPlayer && typeof state.ytPlayer.pauseVideo === 'function') state.ytPlayer.pauseVideo();
        } else if (narrationAudio) {
            narrationAudio.pause();
        }
    } catch {}
}

// Play the next track
function playNext() {
    if (!Array.isArray(state.playlist) || state.playlist.length === 0) return;
    const nextIndex = state.currentTrackIndex + 1;
    if (nextIndex >= state.playlist.length) {
        stopAtEndOfPlaylist();
        return;
    }
    playTrack(nextIndex);
}

// Play the previous track
function playPrevious() {
    if (!Array.isArray(state.playlist) || state.playlist.length === 0) return;
    const prevIndex = state.currentTrackIndex - 1;
    if (prevIndex < 0) return;
    playTrack(prevIndex);
}

// Update the now playing information
function updateNowPlaying({ name, artist, albumArt, duration, position, isPlaying }) {
    if (name !== undefined) trackNameElement.textContent = name;
    if (artist !== undefined) artistNameElement.textContent = artist;
    if (albumArt !== undefined) albumArtElement.src = albumArt || DEFAULT_ALBUM_ART;
    if (duration !== undefined) state.duration = duration;
    if (position !== undefined) state.currentTime = position;
    if (isPlaying !== undefined) state.isPlaying = isPlaying;
    
    // Update the progress bar
    updateProgress();
    
    // Update the play/pause button
    updatePlayPauseButton();

    // Toggle LOCAL badge in Now Playing (show only for local MP3)
    if (localBadgeElement) {
        const isLocal = !!(state.currentTrack && state.currentTrack.type === 'mp3');
        if (isLocal) localBadgeElement.classList.remove('hidden'); else localBadgeElement.classList.add('hidden');
    }
}

// Update the progress bar
function updateProgress() {
    if (state.isPlaying) {
        if (state.currentTrack && state.currentTrack.type === 'youtube') {
            // Use YouTube player timing when available
            try {
                const curSec = (state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function') ? state.ytPlayer.getCurrentTime() : (state.currentTime / 1000);
                const durSec = (state.ytPlayer && typeof state.ytPlayer.getDuration === 'function') ? state.ytPlayer.getDuration() : (state.duration / 1000);
                state.currentTime = Math.max(0, (Number.isFinite(curSec) ? curSec : 0) * 1000);
                state.duration = Math.max(0, (Number.isFinite(durSec) ? durSec : 0) * 1000);
            } catch {}
        } else if (narrationAudio) {
            // Local MP3 timing from HTMLAudioElement
            const durSec = (isFinite(narrationAudio.duration) && narrationAudio.duration > 0)
                ? narrationAudio.duration
                : (state.duration ? state.duration / 1000 : 0);
            const curSec = narrationAudio.currentTime || 0;
            state.duration = Math.max(0, durSec * 1000);
            state.currentTime = Math.max(0, curSec * 1000);
        }

        // Update progress bar and time display
        const progress = state.duration ? (state.currentTime / state.duration) * 100 : 0;
        progressBar.style.width = `${progress}%`;
        currentTimeElement.textContent = formatTime(state.currentTime);
        durationElement.textContent = formatTime(state.duration);
    }
    // Continue the animation loop
    requestAnimationFrame(updateProgress);
}

// Format time in ms to MM:SS
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Update the play/pause button
function updatePlayPauseButton() {
    if (state.isPlaying) {
        playPauseButton.textContent = '⏸';
        playPauseButton.title = 'Pause';
    } else {
        playPauseButton.textContent = '▶';
        playPauseButton.title = 'Play';
    }
}

// Show an error message
function showError(message) {
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
    
    // Hide the error after 5 seconds
    setTimeout(() => {
        errorElement.classList.add('hidden');
    }, 5000);
}

 

// Initialize the player when the page loads (YouTube-only)
document.addEventListener('DOMContentLoaded', async () => {
    // Apply initial layout
    applyModeLayoutVisibility();
    // Refresh both playlist lists
    try { 
        await refreshMyPlaylists(); 
        await refreshAllPlaylists();
    } catch {}
    
    // Set up keyboard shortcuts (ignore when typing in inputs/textareas/contenteditable)
    document.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
        const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
        if (isTyping) {
            return; // don't hijack keys while user is typing
        }
        switch (e.code) {
            case 'Space':
                e.preventDefault();
                togglePlayPause();
                break;
            case 'ArrowRight':
                if (e.ctrlKey) playNext();
                break;
            case 'ArrowLeft':
                if (e.ctrlKey) playPrevious();
                break;
            case 'ArrowUp':
                if (e.ctrlKey) {
                    const newVolume = Math.min(state.volume + 0.1, 1);
                    state.volume = newVolume;
                    volumeControl.value = newVolume * 100;
                }
                break;
            case 'ArrowDown':
                if (e.ctrlKey) {
                    const newVolume = Math.max(state.volume - 0.1, 0);
                    state.volume = newVolume;
                    volumeControl.value = newVolume * 100;
                }
                break;
        }
    });

    // Reconnect to an existing job (for page refresh or clicking pending job)
    function reconnectToJob(jobId) {
        dbg('Reconnecting to job', { jobId });
        
        // Show spinner
        try { if (docSpinner) docSpinner.classList.remove('hidden'); } catch {}
        try { if (generateDocBtn) generateDocBtn.disabled = true; } catch {}
        state.isGeneratingDoc = true;
        
        // Connect to job stream
        connectToJobStream(jobId);
    }
    
    // Connect to SSE stream for a job
    function connectToJobStream(jobId) {
        const eventSource = new EventSource(`/api/jobs/${jobId}/stream`);
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                dbg('SSE event', data);
                
                if (data.type === 'init' || data.type === 'progress') {
                    // Update status with detailed progress
                    const statusText = `${data.stageLabel}${data.detail ? ': ' + data.detail : ''} (${Math.round(data.progress)}%)`;
                    if (docStatusEl) docStatusEl.textContent = statusText;
                    if (docSpinnerText) docSpinnerText.textContent = statusText;
                    
                    // Update My Playlists to show progress
                    refreshMyPlaylists().catch(() => {});
                } else if (data.type === 'complete') {
                    eventSource.close();
                    dbg('Job complete', data.result);
                    handleJobComplete(data.result);
                } else if (data.type === 'error') {
                    eventSource.close();
                    if (docStatusEl) docStatusEl.textContent = `Job failed: ${data.error}`;
                    try { if (docSpinner) docSpinner.classList.add('hidden'); } catch {}
                    try { if (generateDocBtn) generateDocBtn.disabled = false; } catch {}
                    state.isGeneratingDoc = false;
                    refreshMyPlaylists().catch(() => {});
                }
            } catch (err) {
                console.error('SSE parse error', err);
            }
        };
        
        eventSource.onerror = (err) => {
            console.error('SSE error', err);
            eventSource.close();
            if (docStatusEl) docStatusEl.textContent = 'Connection error. Check "My Playlists" for result.';
            try { if (docSpinner) docSpinner.classList.add('hidden'); } catch {}
            try { if (generateDocBtn) generateDocBtn.disabled = false; } catch {}
            state.isGeneratingDoc = false;
        };
    }
    
    // Handle job completion
    async function handleJobComplete(result) {
        try {
            const playlistId = result?.playlistId;
            if (!playlistId) throw new Error('Invalid job result');

            // Load the saved playlist record from the server (source of truth)
            try {
                if (docStatusEl) docStatusEl.textContent = 'Loading playlist…';
                if (docSpinnerText) docSpinnerText.textContent = 'Loading playlist…';
            } catch {}

            const r = await fetch(`/api/playlists/${encodeURIComponent(playlistId)}`);
            if (!r.ok) {
                throw new Error(`Failed to load playlist: ${r.status}`);
            }
            const json = await r.json();
            const pl = json?.playlist;
            if (!pl || !Array.isArray(pl.timeline)) {
                throw new Error('Invalid playlist data');
            }

            // Persist state + URL
            state.loadedPlaylistId = playlistId;
            try {
                const u = new URL(window.location.href);
                u.searchParams.set('playlistId', playlistId);
                window.history.replaceState({}, '', u.toString());
            } catch {}

            if (saveStatusEl) {
                const shareUrl = `${window.location.origin}/player.html?playlistId=${playlistId}`;
                saveStatusEl.textContent = `Saved as: ${pl.title || 'Music history'} — Share ID: ${playlistId} — ${shareUrl}`;
            }

            // Update doc meta fields in player UI
            try {
                if (docTitleDisplay) docTitleDisplay.textContent = pl?.title || '-';
                if (docTopicDisplay) docTopicDisplay.textContent = pl?.topic || '-';
                if (docSummaryDisplay) docSummaryDisplay.textContent = pl?.summary || '-';
            } catch {}

            // Populate raw and reveal
            try {
                if (docOutputEl) docOutputEl.textContent = JSON.stringify(pl, null, 2);
                if (docRawDetails) docRawDetails.classList.remove('hidden');
            } catch {}

            try { await refreshMyPlaylists(); } catch {}
            buildPlaylistFromDoc(pl);
        } catch (err) {
            console.error('Load failed', err);
            if (docStatusEl) docStatusEl.textContent = 'Documentary created. Check "My Playlists".';
        } finally {
            try { if (docSpinner) docSpinner.classList.add('hidden'); } catch {}
            try { if (generateDocBtn) generateDocBtn.disabled = false; } catch {}
            state.isGeneratingDoc = false;
        }
    }

    // Documentary generator
    async function handleGenerateDocClick() {
        if (state.isGeneratingDoc) {
            dbg('Generate clicked while already generating – ignoring');
            return;
        }
        state.isGeneratingDoc = true;
        // UI: show spinner and disable button
        try { if (docSpinner) docSpinner.classList.remove('hidden'); } catch {}
        try { if (generateDocBtn) generateDocBtn.disabled = true; } catch {}
        try { if (docStatusEl) docStatusEl.textContent = 'Generating outline…'; } catch {}
        try { if (docRawDetails) { docRawDetails.classList.add('hidden'); docRawDetails.open = false; } } catch {}
        const topic = (docTopicInput && docTopicInput.value ? docTopicInput.value : '').trim();
        if (!topic) {
            if (docStatusEl) docStatusEl.textContent = 'Please enter a topic (e.g., The Beatles).';
            // hide spinner and re-enable
            try { if (docSpinner) docSpinner.classList.add('hidden'); } catch {}
            try { if (generateDocBtn) generateDocBtn.disabled = false; } catch {}
            return;
        }
        if (docStatusEl) docStatusEl.textContent = 'Generating outline…';
        // Read narration target seconds from state (already loaded from localStorage)
        const narrationTargetSecs = state.sectionClipSeconds || 30;

        const buildFromDoc = (data) => {
            // Update concise status
            try {
                const items = Array.isArray(data?.timeline) ? data.timeline : [];
                const songs = items.filter(x => x && x.type === 'song').length;
                const narr = items.filter(x => x && x.type === 'narration').length;
                const title = data?.title || (data?.topic ? `Music history: ${data.topic}` : 'Music history');
                if (docStatusEl) docStatusEl.textContent = `Generated: ${title} — ${songs} songs, ${narr} narration segments.`;
            } catch {}
            // Populate player doc meta
            try {
                if (docTitleDisplay) docTitleDisplay.textContent = data?.title || '-';
                if (docTopicDisplay) docTopicDisplay.textContent = data?.topic || '-';
                if (docSummaryDisplay) docSummaryDisplay.textContent = data?.summary || '-';
            } catch {}
            // Populate raw JSON and reveal expandable section
            try {
                if (docOutputEl) docOutputEl.textContent = JSON.stringify(data, null, 2);
                if (docRawDetails) docRawDetails.classList.remove('hidden');
            } catch {}
            buildPlaylistFromDoc(data);
        };
        try {
            // Branch by mode first
            if (state.mode === 'youtube') {
                // YouTube-only generation path (server-side job + SSE progress)
                try { if (docStatusEl) docStatusEl.textContent = 'Starting generation job…'; } catch {}
                try { if (docSpinnerText) docSpinnerText.textContent = 'Starting generation job…'; } catch {}

                const createResp = await fetch('/api/jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ topic, narrationTargetSecs })
                });
                if (!createResp.ok) {
                    let errMsg = `Failed to start job: ${createResp.status}`;
                    try {
                        const j = await createResp.json();
                        if (j && (j.error || j.details)) errMsg = `${j.error || ''} ${j.details || ''}`.trim();
                    } catch {
                        try { errMsg = await createResp.text(); } catch {}
                    }
                    throw new Error(errMsg);
                }

                const created = await createResp.json();
                const jobId = created?.jobId;
                if (!jobId) throw new Error('Job creation returned no jobId');

                // Connect to SSE stream; completion will load playlist and rebuild UI
                connectToJobStream(jobId);
                return;
            }

        } catch (err) {
            console.error('doc gen failed', err);
            if (docStatusEl) docStatusEl.textContent = `Generation failed: ${err.message}`;
            try { if (docSpinner) docSpinner.classList.add('hidden'); } catch {}
            try { if (generateDocBtn) generateDocBtn.disabled = false; } catch {}
            state.isGeneratingDoc = false;
        }
    }

    // Attach direct listener when elements are present
    if (generateDocBtn) {
        dbg('Binding click listener for #generate-doc (direct)');
        generateDocBtn.addEventListener('click', handleGenerateDocClick);
    } else {
        dbg('Generate button not found at script parse time');
    }

    // Load by ID
    if (loadIdBtn && loadIdInput) {
        // Trigger load on button click
        loadIdBtn.addEventListener('click', async () => {
            const id = (loadIdInput.value || '').trim();
            if (!id) return;
            // Guard: don't reload if we already loaded this exact playlist id
            if (state.loadedPlaylistId && state.loadedPlaylistId === id) {
                dbg('load-by-id: skipping reload of same id', { id });
                return;
            }
            try {
                if (docStatusEl) docStatusEl.textContent = 'Loading playlist…';
                if (docRawDetails) { docRawDetails.classList.add('hidden'); docRawDetails.open = false; }
                const r = await fetch(`/api/playlists/${encodeURIComponent(id)}`);
                if (!r.ok) {
                    if (docStatusEl) docStatusEl.textContent = 'Playlist not found.';
                    showEmptyState('No playlist found for that ID. Generate an outline or try another ID.');
                    return;
                }
                const json = await r.json();
                const pl = json?.playlist;
                if (!pl || !Array.isArray(pl.timeline)) throw new Error('Invalid playlist data');
                // Close modal if open
                try {
                    const modal = document.getElementById('import-modal');
                    if (modal && !modal.classList.contains('hidden')) {
                        modal.classList.add('hidden');
                        modal.setAttribute('aria-hidden', 'true');
                    }
                } catch {}
                // Show concise status
                try {
                    const items = Array.isArray(pl.timeline) ? pl.timeline : [];
                    const songs = items.filter(x => x && x.type === 'song').length;
                    const narr = items.filter(x => x && x.type === 'narration').length;
                    const title = pl?.title || (pl?.topic ? `Music history: ${pl.topic}` : 'Music history');
                    if (docStatusEl) docStatusEl.textContent = `Loaded: ${title} — ${songs} songs, ${narr} narration segments.`;
                } catch {}
                // Populate player doc meta from loaded playlist
                try {
                    if (docTitleDisplay) docTitleDisplay.textContent = pl?.title || '-';
                    if (docTopicDisplay) docTopicDisplay.textContent = pl?.topic || '-';
                    if (docSummaryDisplay) docSummaryDisplay.textContent = pl?.summary || '-';
                } catch {}
                // Populate raw and reveal
                try {
                    if (docOutputEl) docOutputEl.textContent = JSON.stringify(pl, null, 2);
                    if (docRawDetails) docRawDetails.classList.remove('hidden');
                } catch {}
                buildPlaylistFromDoc(pl);
                state.loadedPlaylistId = id;
            } catch (e) {
                // Graceful handling of bad IDs or network issues
                if (docStatusEl) docStatusEl.textContent = 'Unable to load playlist.';
                showEmptyState('Unable to load playlist. Generate an outline or try another ID.');
            }
        });
        // Trigger load on Enter key
        loadIdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                loadIdBtn.click();
            }
        });
    }

    // Hide player sections until something is loaded (except in YouTube mode)
    if (state.mode === 'youtube') {
        setPlayerSectionsVisible(true);
    } else {
        setPlayerSectionsVisible(false);
    }

    // Auto-load by playlistId query param (only when logged in)
    try {
        if (state.accessToken || state.mode === 'youtube') {
            const params = new URLSearchParams(window.location.search);
            const pid = params.get('playlistId');
            if (pid) {
                if (loadIdInput) loadIdInput.value = pid;
                if (loadIdBtn) loadIdBtn.click();
            }
        }
    } catch {}

    // If no explicit playlistId:
    // 1) If user has playlists in localStorage (returning user), load their latest
    // 2) Else (new user), load the latest anonymous playlist from server
    try {
        const params = new URLSearchParams(window.location.search);
        const pid = params.get('playlistId');
        if (!pid) {
            let loaded = false;
            
            // Check if user has their own playlists in localStorage
            const myPlaylistIds = getMyPlaylistsFromStorage();
            
            if (myPlaylistIds.length > 0) {
                // Returning user - load their latest playlist
                const latestId = myPlaylistIds[0];
                try {
                    const r = await fetch(`/api/playlists/${encodeURIComponent(latestId)}`);
                    if (r.ok) {
                        const json = await r.json();
                        const pl = json?.playlist;
                        if (pl && Array.isArray(pl.timeline)) {
                            try {
                                if (docTitleDisplay) docTitleDisplay.textContent = pl?.title || '-';
                                if (docTopicDisplay) docTopicDisplay.textContent = pl?.topic || '-';
                                if (docSummaryDisplay) docSummaryDisplay.textContent = pl?.summary || '-';
                            } catch {}
                            try {
                                if (docOutputEl) docOutputEl.textContent = JSON.stringify(pl, null, 2);
                                if (docRawDetails) docRawDetails.classList.remove('hidden');
                            } catch {}
                            buildPlaylistFromDoc(pl);
                            if (pl.id) state.loadedPlaylistId = pl.id;
                            loaded = true;
                        }
                    }
                } catch (e) {
                    console.error('Failed to load user\'s latest playlist', e);
                }
            }
            
            if (!loaded) {
                // New user - load latest anonymous playlist from server
                try {
                    const lr = await fetch('/api/users/anonymous/playlists');
                    if (lr.ok) {
                        const ljson = await lr.json();
                        const list = Array.isArray(ljson?.playlists) ? ljson.playlists : [];
                        if (list.length > 0) {
                            const latest = list[0]; // storage sorts desc by createdAt
                            if (latest && Array.isArray(latest.timeline)) {
                                try {
                                    if (docTitleDisplay) docTitleDisplay.textContent = latest?.title || '-';
                                    if (docTopicDisplay) docTopicDisplay.textContent = latest?.topic || '-';
                                    if (docSummaryDisplay) docSummaryDisplay.textContent = latest?.summary || '-';
                                } catch {}
                                try {
                                    if (docOutputEl) docOutputEl.textContent = JSON.stringify(latest, null, 2);
                                    if (docRawDetails) docRawDetails.classList.remove('hidden');
                                } catch {}
                                buildPlaylistFromDoc(latest);
                                if (latest.id) state.loadedPlaylistId = latest.id;
                                loaded = true;
                            }
                        }
                    }
                } catch (e) {
                    console.error('Failed to load latest anonymous playlist', e);
                }
            }
            
            if (!loaded) {
                showEmptyState('No playlists yet. Generate an outline to begin!');
            }
        }
    } catch (e) {
        console.error('Auto-load error', e);
    }

    // (removed duplicate My Playlists rendering block)

    // Import by ID modal handlers
    if (importOpenBtn && importModal) {
        importOpenBtn.addEventListener('click', () => {
            importModal.classList.remove('hidden');
            try { if (loadIdInput) loadIdInput.focus(); } catch {}
        });
    }
    if (importCancelBtn && importModal) {
        importCancelBtn.addEventListener('click', () => {
            importModal.classList.add('hidden');
        });
    }
    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && importModal && !importModal.classList.contains('hidden')) {
            importModal.classList.add('hidden');
        }
    });

    // Share playlist modal handlers
    const sharePlaylistBtn = document.getElementById('share-playlist-btn');
    const shareModal = document.getElementById('share-modal');
    const shareLinkInput = document.getElementById('share-link-input');
    const shareCopyBtn = document.getElementById('share-copy-btn');
    const shareCancelBtn = document.getElementById('share-cancel-btn');
    const shareCopyStatus = document.getElementById('share-copy-status');

    if (sharePlaylistBtn && shareModal && shareLinkInput) {
        sharePlaylistBtn.addEventListener('click', async () => {
            const id = state.loadedPlaylistId;
            if (!id) {
                showError('No playlist loaded. Generate or import a playlist first.');
                return;
            }
            const url = `${window.location.origin}/?playlistId=${id}`;
            shareLinkInput.value = url;
            shareModal.classList.remove('hidden');
            shareModal.setAttribute('aria-hidden', 'false');
            // Auto-copy to clipboard
            try {
                await navigator.clipboard.writeText(url);
                if (shareCopyStatus) {
                    shareCopyStatus.style.display = 'block';
                    setTimeout(() => { shareCopyStatus.style.display = 'none'; }, 2000);
                }
            } catch {
                // Clipboard API may fail; user can still manually copy
            }
            try { shareLinkInput.focus(); shareLinkInput.select(); } catch {}
        });
    }
    if (shareCopyBtn && shareLinkInput) {
        shareCopyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(shareLinkInput.value);
                if (shareCopyStatus) {
                    shareCopyStatus.style.display = 'block';
                    setTimeout(() => { shareCopyStatus.style.display = 'none'; }, 2000);
                }
            } catch {
                // Fallback: select text for manual copy
                try { shareLinkInput.focus(); shareLinkInput.select(); } catch {}
            }
        });
    }
    if (shareCancelBtn && shareModal) {
        shareCancelBtn.addEventListener('click', () => {
            shareModal.classList.add('hidden');
            shareModal.setAttribute('aria-hidden', 'true');
        });
    }
    // Close share modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && shareModal && !shareModal.classList.contains('hidden')) {
            shareModal.classList.add('hidden');
            shareModal.setAttribute('aria-hidden', 'true');
        }
    });

    // Bind section duration select (default 30s) — affects LLM prompt only, not playback
    if (sectionDurationSelect) {
        const applySectionDuration = () => {
            const val = parseInt(sectionDurationSelect.value, 10);
            state.sectionClipSeconds = Number.isFinite(val) && val > 0 ? val : 30;
            // Persist to localStorage
            try {
                const storage = window.sessionStorage || window.localStorage;
                storage.setItem('narration_target_secs', state.sectionClipSeconds.toString());
            } catch {}
            dbg('section duration set (prompt only)', { seconds: state.sectionClipSeconds });
        };
        // Initialize from localStorage or current value
        try {
            const storage = window.sessionStorage || window.localStorage;
            const stored = storage.getItem('narration_target_secs');
            const n = parseInt(stored, 10);
            if (!isNaN(n) && n > 0) {
                sectionDurationSelect.value = n.toString();
            }
        } catch {}
        applySectionDuration();
        // Update on change
        sectionDurationSelect.addEventListener('change', applySectionDuration);
    }

    // iOS hint banner
    const iosHint = document.getElementById('ios-hint');
    const iosHintDismiss = document.getElementById('ios-hint-dismiss');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (isIOS && iosHint) {
        // Check if user has dismissed it before
        const dismissed = localStorage.getItem('ios-hint-dismissed');
        if (!dismissed) {
            iosHint.classList.remove('hidden');
        }
        
        if (iosHintDismiss) {
            iosHintDismiss.addEventListener('click', () => {
                iosHint.classList.add('hidden');
                localStorage.setItem('ios-hint-dismissed', 'true');
            });
        }
    }

    // Theme Toggle Handler
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // Settings Modal Handlers
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            // Load current credentials into form
            const creds = getCustomCredentials();
            if (creds) {
                if (customClientIdInput) customClientIdInput.value = creds.clientId || '';
                if (customClientSecretInput) customClientSecretInput.value = creds.clientSecret || '';
            } else {
                if (customClientIdInput) customClientIdInput.value = '';
                if (customClientSecretInput) customClientSecretInput.value = '';
            }
            // Always show current redirect URI (read-only, for reference)
            if (customRedirectUriInput) customRedirectUriInput.value = getRedirectUri();
            if (settingsModal) settingsModal.classList.remove('hidden');
        });
    }

    if (settingsCloseBtn) {
        settingsCloseBtn.addEventListener('click', () => {
            if (settingsModal) settingsModal.classList.add('hidden');
        });
    }

    if (saveCredentialsBtn) {
        saveCredentialsBtn.addEventListener('click', () => {
            const clientId = customClientIdInput ? customClientIdInput.value.trim() : '';
            const clientSecret = customClientSecretInput ? customClientSecretInput.value.trim() : '';

            if (!clientId || !clientSecret) {
                alert('Please enter both Client ID and Client Secret');
                return;
            }

            saveCustomCredentials(clientId, clientSecret);
            alert('Credentials saved! Please refresh the page and log in again with your credentials.');
            if (settingsModal) settingsModal.classList.add('hidden');
        });
    }

    if (clearCredentialsBtn) {
        clearCredentialsBtn.addEventListener('click', () => {
            if (confirm('Clear custom credentials and use default app credentials?')) {
                clearCustomCredentials();
                alert('Credentials cleared! Refresh the page to use default credentials.');
                if (settingsModal) settingsModal.classList.add('hidden');
            }
        });
    }

    if (openSettingsFromDenied) {
        openSettingsFromDenied.addEventListener('click', () => {
            const accessDeniedOverlay = document.getElementById('access-denied-overlay');
            if (accessDeniedOverlay) accessDeniedOverlay.classList.add('hidden');
            if (settingsBtn) settingsBtn.click();
        });
    }
});
