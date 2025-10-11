const express = require('express');
const path = require('path');
const config = require('./config');
const { dbg } = require('./utils/logger');

// Routes
const configRoute = require('./routes/configRoute');
const ttsRoutes = require('./routes/tts');
const musicDocLiteRoutes = require('./routes/musicDocLite');
const playlistsRoutes = require('./routes/playlists');
const youtubeRoutes = require('./routes/youtube');
const jobsRoutes = require('./routes/jobs');

const app = express();

// Core middleware
app.use(express.json());

// YouTube-only: no special redirect handling
app.get('/', (_req, _res, next) => next());

// Static files
app.use(express.static(config.paths.publicDir));
// Serve TTS output directory at /tts even if stored outside publicDir
app.use('/tts', express.static(config.paths.ttsOutputDir));

// Mount routes
app.use(configRoute);
app.use(ttsRoutes);
app.use(musicDocLiteRoutes);
app.use(playlistsRoutes);
app.use(youtubeRoutes);
app.use('/api/jobs', jobsRoutes);

// Health
app.get('/healthz', (_req, res) => res.json({ ok: true }));

module.exports = app;
