/**
 * QR Menu Guest AI — LLM proxy for the public-facing QR ordering chat.
 *
 * Supports Groq API (free fast inference) via GROQ_API_KEY,
 * with fallback to Zenoti internal gateway (Zeenie) via ZEENIE_API_KEY.
 */
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

const ZEENIE_URL = 'https://zeenie-llm-api.zenotibeta.com/GenericLLM';
const DEFAULT_ZEENIE_MODEL = 'claude-4.5-haiku';

export default async function handler(req, res) {
  // Allow cross-origin requests from QR menu (public page, different origin possible)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try {
    body = await getRequestBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON request body' });
  }

  const { message, chatHistory, menuItems, restaurantName, topSellers } = body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const groqApiKey = process.env.GROQ_API_KEY;
  const zeenieApiKey = process.env.ZEENIE_API_KEY;
  if (!groqApiKey && !zeenieApiKey) {
    return res.status(500).json({
      error: 'GROQ_API_KEY is not configured on the server. Please set GROQ_API_KEY in your environment.',
    });
  }

  const menuContext = (menuItems || [])
    .map(i => `- ${i.name} (${i.category || 'General'}) — ₹${i.price}${i.description ? ': ' + i.description : ''}`)
    .join('\n');

  const topSellersContext = (topSellers || []).length > 0
    ? `\nTop-selling items: ${topSellers.map(i => i.name).join(', ')}`
    : '';

  const systemPrompt = `You are a friendly AI ordering assistant for "${restaurantName || 'our restaurant'}". You help guests discover and order food from the QR menu.

MENU:
${menuContext}
${topSellersContext}

RULES:
1. You can ONLY help with menu discovery and ordering — nothing else.
2. Always be warm, concise, and appetising in your descriptions.
3. When a guest asks what to order or for recommendations, suggest 2-3 items from the menu with brief enticing descriptions. Prioritise top-selling items when relevant.
4. When a guest wants to add item(s) to their cart, include an "add_to_cart" action in your response.
5. Never invent items not on the menu. If asked for something unavailable, apologise and suggest the closest alternative.
6. Keep responses short — guests are on mobile.

Response MUST be a JSON object:
{
  "text": "Your friendly response here.",
  "add_to_cart": [
    { "id": "item_id", "name": "exact item name", "price": 120, "qty": 1 }
  ]
}

"add_to_cart" should only be present when the guest has clearly asked to add specific items. Omit it (or use []) otherwise. Use exact item IDs and names from the menu.`;

  const messagesList = [];
  if (chatHistory && Array.isArray(chatHistory)) {
    chatHistory.forEach(msg => {
      messagesList.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text,
      });
    });
  }
  messagesList.push({ role: 'user', content: message });

  try {
    let raw;
    if (groqApiKey) {
      const groqModel = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
      const groqMessages = [
        { role: 'system', content: systemPrompt },
        ...messagesList,
      ];

      const callGroqWithRetry = async () => {
        let retries = 2;
        let delay = 800;
        let lastError = null;
        while (retries >= 0) {
          try {
            console.log(`[QR-AI] Querying Groq model ${groqModel} (retries left: ${retries})`);
            const response = await fetch(GROQ_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqApiKey}`,
              },
              body: JSON.stringify({
                model: groqModel,
                messages: groqMessages,
                temperature: 0.3,
                max_tokens: 800,
                response_format: { type: 'json_object' },
              }),
            });
            if (response.ok) {
              const data = await response.json();
              const content = data?.choices?.[0]?.message?.content;
              if (content) return content;
            }
            const errText = await response.text();
            lastError = new Error(`Groq API error: ${response.status} - ${errText}`);
            if (response.status !== 500 && response.status !== 503 && response.status !== 429) {
              throw lastError;
            }
          } catch (err) {
            lastError = err;
            if (err.message && err.message.includes('Groq API error: 40')) throw err;
          }
          if (retries > 0) await new Promise(r => setTimeout(r, delay));
          delay *= 2;
          retries--;
        }
        throw lastError || new Error('Groq API request failed');
      };

      raw = await callGroqWithRetry();
    } else {
      const zeenieModel = process.env.ZEENIE_MODEL || DEFAULT_ZEENIE_MODEL;
      const callZeenieWithRetry = async () => {
        let retries = 2;
        let delay = 800;
        let lastError = null;
        while (retries >= 0) {
          try {
            console.log(`[QR-AI] Querying Zeenie model ${zeenieModel} (retries left: ${retries})`);
            const response = await fetch(ZEENIE_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': zeenieApiKey },
              body: JSON.stringify({
                model_name: zeenieModel,
                system: systemPrompt,
                messages: messagesList,
                temperature: 0.3,
                max_tokens: 800,
              }),
            });
            if (response.ok) {
              const data = await response.json();
              const content = data?.response?.content;
              const text = Array.isArray(content)
                ? content.filter(b => b.type === 'text').map(b => b.text).join('')
                : content;
              if (text) return text;
            }
            const errText = await response.text();
            lastError = new Error(`Zeenie ${response.status}: ${errText}`);
            if (response.status !== 500 && response.status !== 429) throw lastError;
          } catch (err) { lastError = err; }
          if (retries > 0) await new Promise(r => setTimeout(r, delay));
          delay *= 2;
          retries--;
        }
        throw lastError || new Error('Zeenie request failed');
      };

      raw = await callZeenieWithRetry();
    }

    let result;
    try {
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      result = JSON.parse(cleaned);
    } catch {
      result = { text: raw, add_to_cart: [] };
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[QR-AI] Error calling LLM API:', err);
    return res.status(500).json({ error: err.message || 'AI unavailable' });
  }
}

async function getRequestBody(req) {
  if (req.body) return req.body;
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (err) { reject(err); }
    });
  });
}
