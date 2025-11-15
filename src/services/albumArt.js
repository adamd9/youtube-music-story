const openai = require('./openaiClient');
const config = require('../config');
const { dbg, truncate } = require('../utils/logger');
const fsp = require('fs').promises;
const path = require('path');

const DEFAULT_PROMPT = 'Generate album art for a new, untitled Metallica album.';

/**
 * Generate a single piece of album art (data URL) that can be reused for narration tracks.
 * @param {object} options
 * @param {string} options.topic - Documentary topic (used to tailor the prompt)
 * @param {string} options.prompt - Optional custom art prompt override
 * @returns {Promise<{ dataUrl: string, prompt: string }|null>}
 */
async function generateNarrationAlbumArt({ topic, prompt } = {}) {
  if (!config?.openai?.apiKey) {
    dbg('album-art: skipped (missing OpenAI key)');
    return null;
  }

  const artPrompt = (prompt && prompt.trim())
    || (topic && topic.trim()
      ? `Generate evocative album art for a new, untitled ${topic.trim()} release.`
      : DEFAULT_PROMPT);

  try {
    dbg('album-art: request', { model: config.openai.imageModel, promptPreview: truncate(artPrompt, 120) });
    const response = await openai.images.generate({
      model: config.openai.imageModel || 'gpt-image-1',
      prompt: artPrompt,
      size: '1024x1024',
      quality: 'medium',
    });

    const b64 = response?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('No album art returned');
    }

    const dataUrl = `data:image/png;base64,${b64}`;
    let publicUrl = null;
    try {
      await fsp.mkdir(config.paths.albumArtDir, { recursive: true });
      const fileName = `art_${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
      const filePath = path.join(config.paths.albumArtDir, fileName);
      await fsp.writeFile(filePath, Buffer.from(b64, 'base64'));
      publicUrl = `/album-art/${fileName}`;
      dbg('album-art: stored', { fileName });
    } catch (fileErr) {
      console.error('album-art: failed to store image file', fileErr);
    }

    dbg('album-art: success');
    return { dataUrl, prompt: artPrompt, publicUrl };
  } catch (err) {
    console.error('album-art: failed', err);
    return null;
  }
}

module.exports = { generateNarrationAlbumArt };
