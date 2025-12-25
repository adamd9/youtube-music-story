const config = require('../config');

// Allow tests and local runs without an API key to swap in a deterministic mock.
if (process.env.MOCK_OPENAI === '1' || !config.openai.apiKey) {
  console.warn('[openai] Using mock client (no API key configured or MOCK_OPENAI=1)');
  module.exports = require('./openaiMock');
  return;
}

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: config.openai.apiKey });

module.exports = openai;
