const { test, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const http = require('node:http');
const fsp = require('node:fs/promises');
const { PassThrough } = require('node:stream');

// Configure environment before loading app code so mocks are applied.
const runtimeDir = path.join(__dirname, '..', 'data', 'test-runtime');
process.env.RUNTIME_DATA_DIR = runtimeDir;
process.env.TTS_OUTPUT_DIR = path.join(runtimeDir, 'tts');
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
process.env.MOCK_OPENAI = '1';
process.env.MOCK_TTS = '1';

const app = require('../src/app');
const { generateMusicPlan, generateNarrationScript, stitchTimeline } = require('../src/services/musicDoc');
const { mapTrackSlotsToYouTube } = require('../src/services/youtubeMap');
const YouTube = require('youtube-sr').default;
const server = http.createServer(app);

async function invokeApp({ method = 'GET', url = '/', body = null, headers = {} }) {
  const reqSocket = new PassThrough();
  const req = new http.IncomingMessage(reqSocket);
  req.method = method;
  req.url = url;
  req.httpVersion = '1.1';
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;

  const rawBody = body !== null && body !== undefined ? Buffer.from(JSON.stringify(body)) : null;
  req.headers = {
    host: 'localhost',
    'content-type': 'application/json',
    'content-length': rawBody ? rawBody.length : 0,
    ...headers,
  };

  if (rawBody) req.push(rawBody);
  req.push(null);

  const resSocket = new PassThrough();
  const res = new http.ServerResponse(req);
  res.assignSocket(resSocket);

  const chunks = [];
  resSocket.on('data', chunk => chunks.push(chunk));

  const result = await new Promise((resolve, reject) => {
    res.on('finish', () => {
      res.detachSocket(resSocket);
      resSocket.end();
      reqSocket.destroy();
      resolve({ statusCode: res.statusCode, raw: Buffer.concat(chunks).toString('utf8') });
    });
    res.on('error', reject);
    server.emit('request', req, res);
  });

  const payload = result.raw.includes('\r\n\r\n')
    ? result.raw.split('\r\n\r\n').slice(1).join('\r\n\r\n')
    : result.raw;

  return { statusCode: result.statusCode, raw: result.raw, body: payload };
}

after(async () => {
  // Clean up test runtime data to keep the workspace tidy.
  await fsp.rm(runtimeDir, { recursive: true, force: true });
  const code = typeof process.exitCode === 'number' ? process.exitCode : 0;
  setImmediate(() => process.exit(code));
});

test('app starts and serves health check', async () => {
  const result = await invokeApp({ url: '/healthz' });
  assert.strictEqual(result.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(result.body), { ok: true });
});

test('generation pipeline completes with mocks', async () => {
  // Stub YouTube search so mapping does not depend on network access.
  const originalSearch = YouTube.search;
  YouTube.search = async () => ([
    { id: 'vid-1', title: 'Test Topic Song 1', channel: { id: 'ch-1', name: 'Test Topic' }, duration: 180000 },
    { id: 'vid-2', title: 'Test Topic Song 2', channel: { id: 'ch-2', name: 'Test Topic' }, duration: 185000 },
  ]);

  try {
    const plan = await generateMusicPlan({
      topic: 'Test Topic',
      prompt: 'Keep it concise',
      narrationTargetSecs: 20,
    });

    assert.ok(plan && Array.isArray(plan.track_slots), 'plan returns track slots');
    assert.strictEqual(plan.track_slots.length, 5);

    const { selections } = await mapTrackSlotsToYouTube(plan.track_slots, { confidenceThreshold: 0.2 });
    assert.strictEqual(selections.length, 5);

    const narration = await generateNarrationScript({
      topic: plan.topic,
      summary: plan.summary,
      trackSlots: plan.track_slots,
      selections,
      narrationTargetSecs: 20,
    });

    const doc = stitchTimeline({ plan, narration, selections });
    assert.ok(doc.timeline.length > 0, 'timeline is populated');
    assert.ok(doc.timeline.some(item => item.type === 'song'), 'timeline includes songs');
    assert.ok(doc.timeline.some(item => item.type === 'narration'), 'timeline includes narration');
    assert.strictEqual(doc.title, plan.title);
  } finally {
    YouTube.search = originalSearch;
  }
});

test('http pipeline endpoint completes', async (t) => {
  const originalSearch = YouTube.search;
  YouTube.search = async () => ([
    { id: 'vid-1', title: 'Test Topic Song 1', channel: { id: 'ch-1', name: 'Test Topic' }, duration: 180000 },
  ]);

  try {
    const result = await invokeApp({
      method: 'POST',
      url: '/api/music-doc-lite',
      body: { topic: 'Test Topic', prompt: 'Keep it sharp', narrationTargetSecs: 20 },
    });

    assert.strictEqual(result.statusCode, 200);
    const json = JSON.parse(result.body);
    assert.ok(Array.isArray(json.timeline), 'response contains timeline array');
    assert.ok(json.timeline.length > 0, 'timeline is populated');
    assert.ok(json.timeline.some(item => item.type === 'song'), 'timeline has songs');
    assert.ok(json.timeline.some(item => item.type === 'narration'), 'timeline has narration');
    assert.strictEqual(json.topic, 'Test Topic');
    // Emit the response so it can be inspected manually when running tests locally.
    console.log('[SMOKE] /api/music-doc-lite response:', JSON.stringify(json, null, 2));
    t.diagnostic(JSON.stringify(json, null, 2));
  } finally {
    YouTube.search = originalSearch;
  }
});
