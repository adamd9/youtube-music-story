const express = require('express');
const jobManager = require('../services/jobManager');
const { dbg } = require('../utils/logger');

const router = express.Router();

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
