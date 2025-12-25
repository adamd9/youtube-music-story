const express = require('express');
const jobManager = require('../services/jobManager');
const config = require('../config');
const path = require('path');
const fsp = require('fs').promises;
const { generateMusicPlan, generateNarrationScript, stitchTimeline } = require('../services/musicDoc');
const { generateNarrationAlbumArt } = require('../services/albumArt');
const { mapTrackSlotsToYouTube } = require('../services/youtubeMap');
const { savePlaylist, updatePlaylist } = require('../services/storage');
const { ttsToMp3Buffer } = require('../services/tts');
const { dbg } = require('../utils/logger');

const router = express.Router();

async function runYouTubeDocJob(jobId, params) {
  const { topic, prompt, narrationTargetSecs } = params || {};
  try {
    jobManager.updateProgress(jobId, {
      status: 'running',
      stage: 1,
      stageLabel: 'Planning tracks',
      progress: 5,
      detail: 'Drafting alternates and story beats',
    });

    const [plan, artResult] = await Promise.all([
      generateMusicPlan({ topic, prompt, narrationTargetSecs }),
      generateNarrationAlbumArt({ topic }),
    ]);

    if (artResult && plan) {
      plan.narrationAlbumArtUrl = artResult.publicUrl || artResult.dataUrl;
    }

    jobManager.updateProgress(jobId, {
      stage: 2,
      stageLabel: 'Preparing playlist',
      progress: 30,
      detail: 'Mapping primary tracks and alternates',
    });

    const { selections, debug } = await mapTrackSlotsToYouTube(plan?.track_slots || [], { confidenceThreshold: 0.8 });

    const narration = await generateNarrationScript({
      topic,
      summary: plan?.summary || '',
      trackSlots: plan?.track_slots || [],
      selections,
      prompt,
      narrationTargetSecs,
    });

    const stitched = stitchTimeline({ plan, narration, selections });
    if (plan?.narrationAlbumArtUrl) {
      stitched.narrationAlbumArtUrl = plan.narrationAlbumArtUrl;
    }
    stitched._debug = { plan, mapping: debug };
    const playlistRecord = await savePlaylist({
      ownerId: 'anonymous',
      title: stitched?.title || (topic ? `Music history: ${topic}` : 'Music history'),
      topic: stitched?.topic || topic || '',
      summary: stitched?.summary || '',
      timeline: stitched?.timeline || [],
      source: 'youtube',
      narrationAlbumArtUrl: stitched?.narrationAlbumArtUrl || null,
      _debug: stitched?._debug,
    });

    const playlistId = playlistRecord.id;

    jobManager.updateProgress(jobId, {
      stage: 3,
      stageLabel: 'Generating narration',
      progress: 70,
      detail: 'Preparing narration tracks',
    });

    const timelineWithTts = Array.isArray(playlistRecord.timeline)
      ? JSON.parse(JSON.stringify(playlistRecord.timeline))
      : [];

    const narrationTargets = [];
    for (const item of timelineWithTts) {
      if (item && item.type === 'narration' && typeof item.text === 'string' && item.text.trim().length > 0) {
        narrationTargets.push(item);
      }
    }

    await fsp.mkdir(config.paths.ttsOutputDir, { recursive: true });

    if (config.features && config.features.mockTts) {
      const placeholder = '/audio/voice-of-character-montervillain-expressions-132288.mp3';
      for (let idx = 0; idx < narrationTargets.length; idx++) {
        const progressPercent = narrationTargets.length > 0
          ? 70 + Math.round((idx / narrationTargets.length) * 25)
          : 95;
        jobManager.updateProgress(jobId, {
          stage: 3,
          stageLabel: 'Generating narration',
          progress: progressPercent,
          detail: `Generating track ${idx + 1}/${narrationTargets.length}`,
        });
        narrationTargets[idx].tts_url = placeholder;
      }
    } else {
      for (let idx = 0; idx < narrationTargets.length; idx++) {
        const progressPercent = narrationTargets.length > 0
          ? 70 + Math.round((idx / narrationTargets.length) * 25)
          : 95;
        jobManager.updateProgress(jobId, {
          stage: 3,
          stageLabel: 'Generating narration',
          progress: progressPercent,
          detail: `Generating track ${idx + 1}/${narrationTargets.length}`,
        });

        const base = `tts_${playlistId.replace(/[^a-zA-Z0-9_-]/g, '-')}_${idx}`;
        const fileName = `${base}.mp3`;
        const filePath = path.join(config.paths.ttsOutputDir, fileName);
        const publicUrl = `/tts/${fileName}`;

        const buf = await ttsToMp3Buffer(narrationTargets[idx].text.trim());
        await fsp.writeFile(filePath, buf);
        narrationTargets[idx].tts_url = publicUrl;
      }
    }

    jobManager.updateProgress(jobId, {
      stage: 4,
      stageLabel: 'Finalizing',
      progress: 96,
      detail: 'Saving playlist',
    });

    const updatedPlaylist = await updatePlaylist(playlistId, {
      timeline: timelineWithTts,
      narrationAlbumArtUrl: stitched?.narrationAlbumArtUrl || playlistRecord.narrationAlbumArtUrl || null,
    });

    jobManager.updateProgress(jobId, {
      stage: 5,
      stageLabel: 'Done',
      progress: 100,
    });

    jobManager.completeJob(jobId, {
      playlistId,
      data: updatedPlaylist || { ...playlistRecord, timeline: timelineWithTts },
    });
  } catch (err) {
    jobManager.failJob(jobId, err);
  }
}

/**
 * Create and start a new generation job
 * POST /api/jobs
 * body: { topic: string, prompt?: string, narrationTargetSecs?: number }
 */
router.post('/', async (req, res) => {
  try {
    if (!config.openai || !config.openai.apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
    }
    const userId = 'anonymous';
    const { topic, prompt, narrationTargetSecs } = req.body || {};
    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: 'Missing required field: topic (string)' });
    }

    const job = jobManager.createJob(userId, {
      topic: topic.trim(),
      prompt: (typeof prompt === 'string') ? prompt : undefined,
      narrationTargetSecs,
    });

    jobManager.updateProgress(job.id, {
      status: 'running',
      stage: 0,
      stageLabel: 'Queued',
      progress: 0,
    });

    setImmediate(() => runYouTubeDocJob(job.id, job.params));
    return res.json({ ok: true, jobId: job.id });
  } catch (e) {
    console.error('jobs:create error', e);
    return res.status(500).json({ error: 'Failed to create job', details: e.message });
  }
});

/**
 * SSE endpoint for job progress streaming
 * GET /api/jobs/:jobId/stream
 */
router.get('/:jobId/stream', (req, res) => {
  const { jobId } = req.params;
  const job = jobManager.getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  dbg('SSE: client connected', { jobId });

  // Send initial state
  res.write(`data: ${JSON.stringify({
    type: 'init',
    jobId,
    status: job.status,
    stage: job.stage,
    stageLabel: job.stageLabel,
    progress: job.progress,
  })}\n\n`);

  // Subscribe to job updates
  const unsubscribe = jobManager.subscribe(
    jobId,
    // onProgress
    (data) => {
      res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
    },
    // onComplete
    (data) => {
      res.write(`data: ${JSON.stringify({ type: 'complete', ...data })}\n\n`);
      res.end();
    },
    // onError
    (data) => {
      res.write(`data: ${JSON.stringify({ type: 'error', ...data })}\n\n`);
      res.end();
    }
  );

  // Cleanup on client disconnect
  req.on('close', () => {
    dbg('SSE: client disconnected', { jobId });
    if (unsubscribe) unsubscribe();
  });
});

/**
 * Get job status
 * GET /api/jobs/:jobId
 */
router.get('/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobManager.getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    id: job.id,
    status: job.status,
    stage: job.stage,
    stageLabel: job.stageLabel,
    progress: job.progress,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  });
});

/**
 * Get all jobs for current user
 * GET /api/jobs
 */
router.get('/', (req, res) => {
  const userId = 'anonymous'; // TODO: Get from auth
  const jobs = jobManager.getUserJobs(userId);

  res.json({
    jobs: jobs.map(job => ({
      id: job.id,
      status: job.status,
      stage: job.stage,
      stageLabel: job.stageLabel,
      progress: job.progress,
      params: job.params,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    })),
  });
});

module.exports = router;
