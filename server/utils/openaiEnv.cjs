function resolveOpenAIReasoningApiKey(env = process.env) {
  return (
    env.OPENAI_REASONING_API_KEY ||
    env.OPENAI_API_KEY ||
    env.REACT_APP_OPENAI_API_KEY ||
    ''
  ).trim();
}

function resolveOpenAIImageApiKey(env = process.env) {
  return (
    env.OPENAI_IMAGES_API_KEY ||
    env.OPENAI_API_KEY ||
    env.REACT_APP_OPENAI_API_KEY ||
    ''
  ).trim();
}

module.exports = {
  resolveOpenAIReasoningApiKey,
  resolveOpenAIImageApiKey,
};
