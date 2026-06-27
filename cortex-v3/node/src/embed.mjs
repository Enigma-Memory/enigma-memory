const DEFAULT_OPENAI_MODEL = 'text-embedding-3-small';
const DEFAULT_OPENAI_DIMENSIONS = 1536;
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

function normalize(vec) {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i += 1) {
    out[i] = vec[i] / norm;
  }
  return out;
}

function parseDimensions(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function createEmbedder(options = {}) {
  const provider = options.provider ?? process.env.CORTEX_EMBEDDING_PROVIDER ?? 'none';
  const apiKey = options.apiKey ?? process.env.CORTEX_EMBEDDING_API_KEY;
  const model = options.model ?? process.env.CORTEX_EMBEDDING_MODEL ?? DEFAULT_OPENAI_MODEL;
  const dimensions = parseDimensions(
    options.dimensions ?? process.env.CORTEX_EMBEDDING_DIMENSIONS,
    DEFAULT_OPENAI_DIMENSIONS
  );

  if (provider === 'openai' && apiKey) {
    return async function embedWithOpenAI(text) {
      const res = await fetch(OPENAI_EMBEDDINGS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model, input: String(text), dimensions })
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`OpenAI embeddings error ${res.status}: ${detail}`);
      }
      const json = await res.json();
      const embedding = json?.data?.[0]?.embedding;
      if (!Array.isArray(embedding)) {
        throw new Error('OpenAI embeddings response missing embedding array');
      }
      return normalize(new Float32Array(embedding));
    };
  }

  // No-op fallback: returns a zero vector of the configured dimensionality.
  return async function embedNoOp() {
    return new Float32Array(dimensions);
  };
}
