const openai = require('./openaiClient');
const config = require('../config');
const { dbg, truncate } = require('../utils/logger');
const { loadTemplate, fillTemplate } = require('../utils/promptLoader');
const { z } = require('zod');
const { zodResponseFormat } = require('openai/helpers/zod');

const TrackCandidateSchema = z.object({
  title: z.string(),
  artist: z.string(),
  album: z.string().nullable(),
  year: z.string().nullable(),
  youtube_hint: z.string().nullable(),
  note: z.string().nullable().optional(),
});

const TrackSlotSchema = z.object({
  slot_id: z.string(),
  arc_label: z.string(),
  chronology_hint: z.string().nullable(),
  narrative_focus: z.string(),
  primary: TrackCandidateSchema,
  alternates: z.array(TrackCandidateSchema).max(2)
    .describe('Highest priority alternates first, optional if primary is strong'),
});

const MusicPlanSchema = z.object({
  title: z.string(),
  topic: z.string(),
  summary: z.string(),
  narrative_arc: z.string(),
  track_slots: z.array(TrackSlotSchema).length(5)
    .describe('Exactly five chapters in chronological order'),
});

const NarrationSegmentSchema = z.object({
  slot_id: z.string(),
  title: z.string(),
  text: z.string(),
});

const NarrationScriptSchema = z.object({
  intro: NarrationSegmentSchema,
  outro: NarrationSegmentSchema,
  song_segments: z.array(NarrationSegmentSchema).length(5),
});

function buildNarrationPromptExtras(prompt) {
  return prompt && typeof prompt === 'string' && prompt.trim().length > 0
    ? `\n\nAdditional instructions from user (apply carefully):\n${prompt.trim()}`
    : '';
}

async function generateMusicPlan({ topic, prompt, narrationTargetSecs }) {
  const systemTpl = loadTemplate('prompts/musicDoc/plan_system.txt');
  const userTpl = loadTemplate('prompts/musicDoc/plan_user.txt');

  const systemPrompt = fillTemplate(systemTpl, { SCHEMA: '(Structured Output Schema Enabled)' });
  const userPrompt = fillTemplate(userTpl, {
    TOPIC: topic,
    EXTRA: buildNarrationPromptExtras(prompt).trim(),
    NARRATION_TARGET_SECS: String(Number.isFinite(narrationTargetSecs) && narrationTargetSecs > 0
      ? Math.floor(narrationTargetSecs)
      : 30)
  });

  dbg('music-plan: request', {
    model: 'gpt-4.1',
    instructionsPreview: truncate(systemPrompt, 400),
    inputPreview: truncate(userPrompt, 400),
  });

  const completion = await openai.chat.completions.parse({
    model: 'gpt-4.1',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: zodResponseFormat(MusicPlanSchema, 'music_story_plan'),
  });

  const data = completion.choices[0].message.parsed;
  if (config && config.serverDebug) {
    data._debug = {
      ...(data._debug || {}),
      openai_request: {
        model: 'gpt-4.1',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'zodResponseFormat', name: 'music_story_plan' },
      },
    };
  }
  dbg('music-plan: parsed response', { title: data?.title });
  return data;
}

async function generateNarrationScript({ topic, summary, trackSlots, selections, prompt, narrationTargetSecs }) {
  const systemTpl = loadTemplate('prompts/musicDoc/narration_system.txt');
  const userTpl = loadTemplate('prompts/musicDoc/narration_user.txt');

  const systemPrompt = fillTemplate(systemTpl, { SCHEMA: '(Structured Output Schema Enabled)' });
  const userPrompt = fillTemplate(userTpl, {
    TOPIC: topic,
    SUMMARY: summary || '',
    TRACK_SLOTS: JSON.stringify(trackSlots || [], null, 2),
    SELECTED_TRACKS: JSON.stringify(selections || [], null, 2),
    EXTRA: buildNarrationPromptExtras(prompt).trim(),
    NARRATION_TARGET_SECS: String(Number.isFinite(narrationTargetSecs) && narrationTargetSecs > 0
      ? Math.floor(narrationTargetSecs)
      : 30)
  });

  dbg('music-narration: request', {
    model: 'gpt-4.1',
    instructionsPreview: truncate(systemPrompt, 400),
    inputPreview: truncate(userPrompt, 400),
  });

  const completion = await openai.chat.completions.parse({
    model: 'gpt-4.1',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: zodResponseFormat(NarrationScriptSchema, 'music_story_narration'),
  });

  const data = completion.choices[0].message.parsed;
  if (config && config.serverDebug) {
    data._debug = {
      ...(data._debug || {}),
      openai_request: {
        model: 'gpt-4.1',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'zodResponseFormat', name: 'music_story_narration' },
      },
    };
  }
  dbg('music-narration: parsed response', { intro: data?.intro?.title });
  return data;
}

function stitchTimeline({ plan, narration, selections }) {
  if (!plan || !narration || !Array.isArray(selections)) return { timeline: [] };
  const slotMap = new Map();
  selections.forEach(sel => { if (sel && sel.slot_id) slotMap.set(sel.slot_id, sel); });

  const timeline = [];
  if (narration.intro) {
    timeline.push({ type: 'narration', title: narration.intro.title, text: narration.intro.text });
  }

  for (const segment of narration.song_segments || []) {
    const selection = slotMap.get(segment.slot_id);
    timeline.push({ type: 'narration', title: segment.title, text: segment.text });
    if (selection) {
      const { youtube, ...rest } = selection;
      timeline.push({ type: 'song', ...rest, youtube: youtube || null });
    }
  }

  if (narration.outro) {
    timeline.push({ type: 'narration', title: narration.outro.title, text: narration.outro.text });
  }

  return { title: plan.title, topic: plan.topic, summary: plan.summary, timeline };
}

async function generateMusicDoc({ topic, prompt, narrationTargetSecs }) {
  const plan = await generateMusicPlan({ topic, prompt, narrationTargetSecs });
  const selections = Array.isArray(plan?.track_slots)
    ? plan.track_slots.map(slot => ({ ...slot.primary, slot_id: slot.slot_id }))
    : [];
  const narration = await generateNarrationScript({
    topic,
    summary: plan?.summary || '',
    trackSlots: plan?.track_slots || [],
    selections,
    prompt,
    narrationTargetSecs,
  });
  const doc = stitchTimeline({ plan, narration, selections });
  doc.plan = plan;
  return doc;
}

module.exports = {
  generateMusicPlan,
  generateNarrationScript,
  stitchTimeline,
  generateMusicDoc,
};
