/**
 * QR Menu Guest AI — LLM proxy for the public-facing QR ordering chat.
 *
 * All LLM traffic goes through Zenoti's internal gateway (Zeenie) per org
 * policy — never a provider API directly.
 */
const ZEENIE_URL = 'https://zeenie-llm-api.zenotibeta.com/GenericLLM';
const MODEL = process.env.ZEENIE_MODEL || 'claude-4.5-haiku';

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

  const apiKey = process.env.ZEENIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ZEENIE_API_KEY is not configured. Raise a Jira ticket for Zenoti LLM API access.',
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
    const callZeenieWithRetry = async () => {
      let retries = 2;
      let delay = 800;
      let lastError = null;
      while (retries >= 0) {
        try {
          const response = await fetch(ZEENIE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify({
              model_name: MODEL,
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

    const raw = await callZeenieWithRetry();
    let result;
    try {
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      result = JSON.parse(cleaned);
    } catch {
      result = { text: raw, add_to_cart: [] };
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[QR-AI] Zeenie error:', err);
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
