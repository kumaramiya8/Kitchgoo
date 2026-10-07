/**
 * Kitchgoo Copilot — LLM proxy.
 *
 * Supports Groq API (free fast inference) via GROQ_API_KEY,
 * with fallback to Zenoti internal gateway (Zeenie) via ZEENIE_API_KEY.
 */
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

const ZEENIE_URL = 'https://zeenie-llm-api.zenotibeta.com/GenericLLM';
const DEFAULT_ZEENIE_MODEL = 'claude-4.5-haiku';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try {
    body = await getRequestBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON request body' });
  }

  const { message, chatHistory, contextData } = body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const groqApiKey = process.env.GROQ_API_KEY;
  const zeenieApiKey = process.env.ZEENIE_API_KEY;
  if (!groqApiKey && !zeenieApiKey) {
    return res.status(500).json({
      error: 'GROQ_API_KEY is not configured on the server. Please set GROQ_API_KEY in your environment.'
    });
  }

  try {
    const systemPrompt = `You are the Kitchgoo AI Assistant, a helpful co-pilot for restaurant managers, servers, and owners using the Kitchgoo POS & restaurant management SaaS.
Views: /pos (Billing), /kds (Kitchen), /menu (Menu), /inventory (Stock), /delivery (Delivery), /staff (Team), /guests (CRM), /reservations (Bookings), /reports (Reports), /settings (Config).

Rules:
1. Provide clear, concise step-by-step markdown explanations.
2. If the user asks to change settings, navigate, update stock, seat tables, or add menu items, you MUST include a "suggestions" array with actionable buttons.
3. Supported actions in "suggestions":
   - navigate: { "type": "navigate", "path": "/reports?tab=dashboard" | "/settings?tab=payments" | "/pos" | "/kds" | "/inventory" }
   - update_setting: { "type": "update_setting", "section": "restaurant"|"billing"|"payments"|"delivery"|"operations"|"notifications"|"printer", "data": { ... } }
   - open_modal: { "type": "open_modal", "modal": "cash_drawer"|"add_item"|"add_staff"|"waste_log" }
   - seat_table_order: { "type": "seat_table_order", "tableId": "id", "tableName": "name", "guestName": "name", "items": [{ "id": "id", "name": "name", "price": 100, "qty": 1 }] }
   - bulk_update_stock: { "type": "bulk_update_stock", "updates": [{ "id": "id", "name": "name", "stock": 25 }] }
   - bulk_add_menu_items: { "type": "bulk_add_menu_items", "menuItems": [{ "name": "Name", "price": 120, "category": "Starters", "calories": 400, "ingredients": [{ "name": "Ing", "qty": 0.5, "unit": "kg" }], "image": "<svg viewBox=\\"0 0 100 100\\"><circle cx=\\"50\\" cy=\\"50\\" r=\\"40\\" fill=\\"#D2691E\\"/></svg>", "recipeInstructions": "Short prep steps.", "recipePlating": "Plating description." }], "newInventoryItems": [{ "name": "Ing", "category": "Food", "stock": 0, "unit": "kg", "min": 5 }] }

The response MUST be a JSON object with this schema:
{
  "text": "Your markdown formatted response text here.",
  "suggestions": [
    {
      "label": "Action button label",
      "action": { ... }
    }
  ]
}

Respond with ONLY the raw JSON object — no markdown code fences, no commentary outside the JSON.`;

    const messagesList = [];
    if (chatHistory && Array.isArray(chatHistory)) {
      // Keep only last 4 messages to prevent token budget blowout
      const recentHistory = chatHistory.slice(-4);
      recentHistory.forEach(msg => {
        messagesList.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text,
        });
      });
    }
    messagesList.push({
      role: 'user',
      content: `User query: "${message}"\n\nContext Data:\n${JSON.stringify(contextData || {})}`,
    });

    let responseText;

    if (groqApiKey) {
      const groqModel = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
      const groqMessages = [
        { role: 'system', content: systemPrompt },
        ...messagesList,
      ];

      const callGroqWithRetry = async () => {
        let retries = 2;
        let delay = 1000;
        let lastError = null;

        while (retries >= 0) {
          try {
            console.log(`[API] Querying Groq model ${groqModel} (retries left: ${retries})`);
            const response = await fetch(GROQ_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqApiKey}`,
              },
              body: JSON.stringify({
                model: groqModel,
                messages: groqMessages,
                temperature: 0.2,
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
              throw lastError; // Non-retryable error (e.g. 401 invalid key, 400 bad request)
            }
          } catch (err) {
            lastError = err;
            if (err.message && err.message.includes('Groq API error: 40')) {
              throw err;
            }
          }

          if (retries > 0) {
            console.log(`[API] Temporary failure on Groq API, retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            delay *= 2;
          }
          retries--;
        }
        throw lastError || new Error('Groq API request failed');
      };

      responseText = await callGroqWithRetry();
    } else {
      const zeenieModel = process.env.ZEENIE_MODEL || DEFAULT_ZEENIE_MODEL;
      const callZeenieWithRetry = async () => {
        let retries = 2;
        let delay = 1000;
        let lastError = null;

        while (retries >= 0) {
          try {
            console.log(`[API] Querying Zeenie model ${zeenieModel} (retries left: ${retries})`);
            const response = await fetch(ZEENIE_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': zeenieApiKey,
              },
              body: JSON.stringify({
                model_name: zeenieModel,
                system: systemPrompt,
                messages: messagesList,
                temperature: 0.1,
                max_tokens: 8000,
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
            lastError = new Error(`Zeenie API error: ${response.status} - ${errText}`);

            if (response.status !== 500 && response.status !== 429) {
              throw lastError; // Non-retryable error (e.g. 403 bad key, 400 bad request)
            }
          } catch (err) {
            lastError = err;
          }

          if (retries > 0) {
            console.log(`[API] Temporary failure on Zeenie API, retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            delay *= 2;
          }
          retries--;
        }
        throw lastError || new Error('Zeenie API request failed');
      };

      responseText = await callZeenieWithRetry();
    }

    // The model is instructed to return raw JSON; tolerate stray code fences
    let resultObj;
    try {
      const cleaned = responseText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      resultObj = JSON.parse(cleaned);
    } catch {
      console.warn('[API] Model response was not valid JSON, returning raw text');
      resultObj = { text: responseText, suggestions: [] };
    }

    return res.status(200).json(resultObj);

  } catch (err) {
    console.error('[API] Error calling Copilot LLM API:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

async function getRequestBody(req) {
  if (req.body) return req.body;
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}
