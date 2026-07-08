// ---------------------------------------------------------------------------
// OpenRouter client — text, vision, and image generation over one API.
// ---------------------------------------------------------------------------

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const cfg = {
  key: () => process.env.OPENROUTER_API_KEY,
  textModel: () => process.env.ISLAND_TEXT_MODEL || 'anthropic/claude-sonnet-4.5',
  visionModel: () => process.env.ISLAND_VISION_MODEL || 'anthropic/claude-sonnet-4.5',
  imageModel: () => process.env.ISLAND_IMAGE_MODEL || 'google/gemini-2.5-flash-image',
};

export function hasKey() {
  return Boolean(cfg.key());
}

async function post(body, { retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.key()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/johncpalmer/point-and-click',
          'X-Title': 'ISLAND',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
      }
      const json = await res.json();
      if (json.error) throw new Error(`OpenRouter error: ${JSON.stringify(json.error).slice(0, 300)}`);
      return json;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/** Plain text completion. */
export async function chat(system, messages, { model, maxTokens = 1024, temperature = 0.9 } = {}) {
  const json = await post({
    model: model || cfg.textModel(),
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'system', content: system }, ...messages],
  });
  return json.choices?.[0]?.message?.content ?? '';
}

/** Completion where the last user turn includes an image (base64 buffer). */
export async function chatWithImage(system, userText, imageBuffer, { model, maxTokens = 1024, temperature = 0.4 } = {}) {
  const json = await post({
    model: model || cfg.visionModel(),
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}` },
          },
        ],
      },
    ],
  });
  return json.choices?.[0]?.message?.content ?? '';
}

/**
 * Generate an image. Returns a Buffer (PNG/JPEG as produced by the model).
 * Uses OpenRouter's multimodal output: modalities ["image","text"].
 */
export async function generateImage(prompt, { model } = {}) {
  const json = await post(
    {
      model: model || cfg.imageModel(),
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content: prompt }],
    },
    { retries: 3 }
  );
  const msg = json.choices?.[0]?.message;
  const url =
    msg?.images?.[0]?.image_url?.url ||
    msg?.images?.[0]?.url ||
    (Array.isArray(msg?.content)
      ? msg.content.find((p) => p.type === 'image_url')?.image_url?.url
      : null);
  if (!url) throw new Error('Image model returned no image');
  if (url.startsWith('data:')) {
    const b64 = url.slice(url.indexOf(',') + 1);
    return Buffer.from(b64, 'base64');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch generated image: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Generate an image conditioned on one or more reference images. Same as
 * generateImage, but the user message carries the prompt text plus the
 * reference image(s) so the model paints the same physical place from a new
 * vantage. `references` may be a single Buffer or an array of Buffers; all are
 * appended as image_url parts after the text, in order. Returns a Buffer.
 */
export async function generateImageWithReference(prompt, references, { model } = {}) {
  const refs = Array.isArray(references) ? references : [references];
  const imageParts = refs
    .filter(Boolean)
    .map((buf) => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` },
    }));
  const json = await post(
    {
      model: model || cfg.imageModel(),
      modalities: ['image', 'text'],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }, ...imageParts],
        },
      ],
    },
    { retries: 3 }
  );
  const msg = json.choices?.[0]?.message;
  const url =
    msg?.images?.[0]?.image_url?.url ||
    msg?.images?.[0]?.url ||
    (Array.isArray(msg?.content)
      ? msg.content.find((p) => p.type === 'image_url')?.image_url?.url
      : null);
  if (!url) throw new Error('Image model returned no image');
  if (url.startsWith('data:')) {
    const b64 = url.slice(url.indexOf(',') + 1);
    return Buffer.from(b64, 'base64');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch generated image: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Parse a JSON object out of a model reply that may include fences/preamble. */
export function parseJson(text) {
  if (!text) throw new Error('Empty model response');
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON in model response: ${text.slice(0, 200)}`);
  return JSON.parse(cleaned.slice(start, end + 1));
}
