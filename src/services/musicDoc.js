const openai = require('./openaiClient');
const config = require('../config');
const { dbg, truncate } = require('../utils/logger');
const { loadTemplate, fillTemplate } = require('../utils/promptLoader');
const { z } = require('zod');
const { zodResponseFormat } = require('openai/helpers/zod');

async function generateMusicDoc({ topic, prompt, catalog, narrationTargetSecs }) {
  // Define Zod schema for structured output
  const MusicDocSchema = z.object({
    title: z.string(),
    topic: z.string(),
    summary: z.string(),
    timeline: z.array(
      z.object({
        type: z.enum(['narration', 'song']),
        title: z.string().describe('Title for both narration segments and songs'),
        text: z.string().nullable().describe('Narration text (required for narration type, null for song)'),
        artist: z.string().nullable().describe('Artist name (required for song type, null for narration)'),
        album: z.string().nullable(),
        year: z.string().nullable(),
        youtube_hint: z.string().nullable().describe('Search hint for finding the song on YouTube')
      })
    ).min(6).describe('Interleaved timeline of narration and song items')
  });

  // Load externalized templates
  const systemTpl = loadTemplate('prompts/musicDoc/system.txt');
  const userTpl = loadTemplate('prompts/musicDoc/user.txt');
  
  // We no longer need to inject the raw JSON schema string into the prompt text
  // because structured outputs handles the schema enforcement.
  const systemPrompt = fillTemplate(systemTpl, { SCHEMA: '(Structured Output Schema Enabled)' });

  const extra = prompt && typeof prompt === 'string' && prompt.trim().length > 0
    ? `\n\nAdditional instructions from user (apply carefully):\n${prompt.trim()}`
    : '';
  let catalogNote = '';
  if (Array.isArray(catalog) && catalog.length > 0) {
    const trimmed = catalog.map(t => ({ name: t.name, artist: t.artist, album: t.album, release_date: t.release_date, duration_ms: t.duration_ms })).slice(0, 500);
    catalogNote = `\n\nCandidate track catalog (choose ONLY from these if selecting songs):\n${JSON.stringify(trimmed, null, 2)}`;
  }

  const targetSecs = Number.isFinite(narrationTargetSecs) && narrationTargetSecs > 0 ? Math.floor(narrationTargetSecs) : 30;
  const userPrompt = fillTemplate(userTpl, {
    TOPIC: topic,
    EXTRA: (extra || '').trim(),
    CATALOG_NOTE: (catalogNote || '').trim(),
    NARRATION_TARGET_SECS: String(targetSecs)
  });

  dbg('music-doc: request', {
    model: 'gpt-4.1',
    instructionsPreview: truncate(systemPrompt, 400),
    inputPreview: truncate(userPrompt, 400),
    catalogCount: Array.isArray(catalog) ? catalog.length : 0
  });

  const openaiRequest = {
    model: 'gpt-4.1',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: zodResponseFormat(MusicDocSchema, 'music_documentary'),
  };

  const completion = await openai.chat.completions.parse(openaiRequest);

  const data = completion.choices[0].message.parsed;
  if (config && config.serverDebug) {
    const safeOpenaiRequest = {
      model: openaiRequest.model,
      messages: openaiRequest.messages,
      response_format: {
        type: 'zodResponseFormat',
        name: 'music_documentary'
      }
    };
    data._debug = { ...(data._debug || {}), openai_request: safeOpenaiRequest };
  }
  dbg('music-doc: parsed response', { title: data?.title, items: data?.timeline?.length });
  return data;
}

module.exports = { generateMusicDoc };
