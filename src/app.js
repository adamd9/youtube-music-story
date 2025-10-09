const express = require('express');
const path = require('path');
const config = require('./config');
const { dbg } = require('./utils/logger');

// Routes
const configRoute = require('./routes/configRoute');
const authRoutes = require('./routes/auth');
const customAuthRoutes = require('./routes/customAuth');
const spotifyRoutes = require('./routes/spotify');
const ttsRoutes = require('./routes/tts');
const musicDocRoutes = require('./routes/musicDoc');
const musicDocLiteRoutes = require('./routes/musicDocLite');
const jobsRoutes = require('./routes/jobs');
const playlistsRoutes = require('./routes/playlists');
const youtubeRoutes = require('./routes/youtube');

const app = express();

// Core middleware
app.use(express.json());

// Early redirect: if visiting root with ?mode=spotify, forward to /player.html
app.get('/', (req, res, next) => {
  try {
    const mode = String(req.query.mode || '').toLowerCase();
    if (mode === 'spotify') {
      const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
      return res.redirect(302, `/player.html${qs}`);
    }
  } catch {}
  return next();
});

// Static files
app.use(express.static(config.paths.publicDir));
// Serve TTS output directory at /tts even if stored outside publicDir
app.use('/tts', express.static(config.paths.ttsOutputDir));

// Mount routes
app.use(configRoute);
app.use(authRoutes);
app.use(customAuthRoutes);
app.use(spotifyRoutes);
app.use(ttsRoutes);
app.use(musicDocRoutes);
app.use(musicDocLiteRoutes);
app.use(jobsRoutes);
app.use(playlistsRoutes);
app.use(youtubeRoutes);

// Health
app.get('/healthz', (_req, res) => res.json({ ok: true }));

module.exports = app;
