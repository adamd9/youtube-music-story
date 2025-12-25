const DEFAULT_TOPIC = 'Test Topic';

function extractTopic(messages = []) {
  for (const msg of messages) {
    if (msg && msg.role === 'user' && typeof msg.content === 'string') {
      const match = msg.content.match(/Topic:\s*(.+)/i);
      if (match) return match[1].trim();
    }
  }
  return DEFAULT_TOPIC;
}

function extractFirstJsonArray(text) {
  if (!text || typeof text !== 'string') return null;
  const matches = text.match(/\[[\s\S]*?\]/g);
  if (!matches || matches.length === 0) return null;
  for (const raw of matches) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      continue;
    }
  }
  return null;
}

function buildPlan(topic) {
  const effectiveTopic = topic || DEFAULT_TOPIC;
  const slots = Array.from({ length: 5 }).map((_, idx) => ({
    slot_id: `slot-${idx + 1}`,
    arc_label: `Chapter ${idx + 1}`,
    chronology_hint: null,
    narrative_focus: `Narrative focus ${idx + 1}`,
    primary: {
      title: `${effectiveTopic} Song ${idx + 1}`,
      artist: `${effectiveTopic} Artist`,
      album: null,
      year: `20${10 + idx}`,
      youtube_hint: '',
      note: null,
    },
    alternates: [],
  }));

  return {
    title: `${effectiveTopic} Documentary`,
    topic: effectiveTopic,
    summary: `${effectiveTopic} summary`,
    narrative_arc: 'Intro, rise, climax, fall, outro',
    track_slots: slots,
  };
}

function buildNarration(trackSlots = []) {
  const songSegments = (trackSlots.length > 0 ? trackSlots : Array.from({ length: 5 }).map((_, idx) => ({
    slot_id: `slot-${idx + 1}`,
    title: `Slot ${idx + 1}`,
  }))).map((slot) => ({
    slot_id: slot.slot_id,
    title: `${slot.title || slot.arc_label || 'Chapter'} narration`,
    text: `Narration for ${slot.title || slot.arc_label || slot.slot_id}.`,
  }));

  return {
    intro: { slot_id: 'intro', title: 'Intro', text: 'Opening narration.' },
    outro: { slot_id: 'outro', title: 'Outro', text: 'Closing narration.' },
    song_segments: songSegments,
  };
}

async function parseCompletion({ messages = [], response_format } = {}) {
  const topic = extractTopic(messages);
  const formatName = response_format?.name
    || response_format?.json_schema?.name
    || response_format?.response_format?.name;

  if (formatName === 'music_story_plan') {
    return { choices: [{ message: { parsed: buildPlan(topic) } }] };
  }

  if (formatName === 'music_story_narration') {
    const userMsg = messages.find((m) => m && m.role === 'user' && typeof m.content === 'string');
    const parsedTrackSlots = userMsg ? extractFirstJsonArray(userMsg.content) : null;
    return { choices: [{ message: { parsed: buildNarration(parsedTrackSlots || []) } }] };
  }

  return { choices: [{ message: { parsed: { ok: true } } }] };
}

const mockOpenAI = {
  chat: {
    completions: {
      parse: parseCompletion,
    },
  },
  images: {
    generate: async () => ({
      data: [{ b64_json: Buffer.from('mock-image').toString('base64') }],
    }),
  },
  audio: {
    speech: {
      create: async () => ({
        arrayBuffer: async () => Buffer.from('mock-mp3'),
      }),
    },
  },
};

module.exports = mockOpenAI;
