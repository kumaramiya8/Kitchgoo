import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import helpHandler from '../api/help.js';
import qrAiHandler from '../api/qr-ai.js';

describe('Copilot & QR AI Groq integration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
    delete process.env.ZEENIE_API_KEY;
    delete process.env.ZEENIE_MODEL;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  const createMockRes = () => {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, val) {
        this.headers[name] = val;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
      end(data) {
        this.body = data;
        return this;
      },
    };
    return res;
  };

  describe('/api/help', () => {
    it('returns 500 error when neither GROQ_API_KEY nor ZEENIE_API_KEY is configured', async () => {
      const req = {
        method: 'POST',
        body: { message: 'Hello' },
      };
      const res = createMockRes();

      await helpHandler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toContain('GROQ_API_KEY is not configured');
    });

    it('queries Groq API when GROQ_API_KEY is set', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_test_key';

      const mockGroqResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                text: 'Here is your sales summary for today.',
                suggestions: [
                  {
                    label: 'View Reports',
                    action: { type: 'navigate', path: '/reports?tab=dashboard' },
                  },
                ],
              }),
            },
          },
        ],
      };

      let fetchUrl = null;
      let fetchOptions = null;
      global.fetch = vi.fn().mockImplementation((url, options) => {
        fetchUrl = url;
        fetchOptions = options;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockGroqResponse),
        });
      });

      const req = {
        method: 'POST',
        body: {
          message: 'Analyze sales',
          chatHistory: [{ sender: 'user', text: 'hi' }, { sender: 'ai', text: 'hello' }],
          contextData: { salesSummary: { today: 5000 } },
        },
      };
      const res = createMockRes();

      await helpHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(fetchUrl).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(fetchOptions.headers['Authorization']).toBe('Bearer gsk_mock_test_key');

      const parsedBody = JSON.parse(fetchOptions.body);
      expect(parsedBody.model).toBe('openai/gpt-oss-120b');
      expect(parsedBody.response_format).toEqual({ type: 'json_object' });
      expect(parsedBody.messages[0].role).toBe('system');
      expect(parsedBody.messages[1].role).toBe('user');
      expect(parsedBody.messages[2].role).toBe('assistant');
      expect(parsedBody.messages[3].role).toBe('user');
      expect(parsedBody.messages[3].content).toContain('User query: "Analyze sales"');

      expect(res.body.text).toBe('Here is your sales summary for today.');
      expect(res.body.suggestions).toHaveLength(1);
      expect(res.body.suggestions[0].label).toBe('View Reports');
    });

    it('respects GROQ_MODEL environment variable', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_test_key';
      process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';

      let capturedBody = null;
      global.fetch = vi.fn().mockImplementation((url, options) => {
        capturedBody = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            choices: [{ message: { content: '{"text":"custom model answer","suggestions":[]}' } }],
          }),
        });
      });

      const req = {
        method: 'POST',
        body: { message: 'test' },
      };
      const res = createMockRes();

      await helpHandler(req, res);

      expect(capturedBody.model).toBe('llama-3.3-70b-versatile');
      expect(res.body.text).toBe('custom model answer');
    });

    it('falls back to Zeenie when only ZEENIE_API_KEY is configured', async () => {
      process.env.ZEENIE_API_KEY = 'mock_zeenie_key';

      let fetchUrl = null;
      let fetchOptions = null;
      global.fetch = vi.fn().mockImplementation((url, options) => {
        fetchUrl = url;
        fetchOptions = options;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            response: {
              content: '{"text":"zeenie response","suggestions":[]}',
            },
          }),
        });
      });

      const req = {
        method: 'POST',
        body: { message: 'hello zeenie' },
      };
      const res = createMockRes();

      await helpHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(fetchUrl).toBe('https://zeenie-llm-api.zenotibeta.com/GenericLLM');
      expect(fetchOptions.headers['x-api-key']).toBe('mock_zeenie_key');
      expect(res.body.text).toBe('zeenie response');
    });
  });

  describe('/api/qr-ai', () => {
    it('returns 500 when neither GROQ_API_KEY nor ZEENIE_API_KEY is set', async () => {
      const req = {
        method: 'POST',
        body: { message: 'Can you recommend pasta?' },
      };
      const res = createMockRes();

      await qrAiHandler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toContain('GROQ_API_KEY is not configured');
    });

    it('queries Groq API when GROQ_API_KEY is configured', async () => {
      process.env.GROQ_API_KEY = 'gsk_mock_test_key';

      let fetchUrl = null;
      let fetchOptions = null;
      global.fetch = vi.fn().mockImplementation((url, options) => {
        fetchUrl = url;
        fetchOptions = options;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    text: 'I recommend our Creamy Alfredo Pasta!',
                    add_to_cart: [{ id: 'item_1', name: 'Creamy Alfredo Pasta', price: 240, qty: 1 }],
                  }),
                },
              },
            ],
          }),
        });
      });

      const req = {
        method: 'POST',
        body: {
          message: 'What pasta do you have?',
          menuItems: [{ id: 'item_1', name: 'Creamy Alfredo Pasta', price: 240, category: 'Mains' }],
          restaurantName: 'Gourmet Bistro',
        },
      };
      const res = createMockRes();

      await qrAiHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(fetchUrl).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(fetchOptions.headers['Authorization']).toBe('Bearer gsk_mock_test_key');
      const parsed = JSON.parse(fetchOptions.body);
      expect(parsed.model).toBe('openai/gpt-oss-120b');
      expect(parsed.response_format).toEqual({ type: 'json_object' });
      expect(res.body.text).toBe('I recommend our Creamy Alfredo Pasta!');
      expect(res.body.add_to_cart).toHaveLength(1);
      expect(res.body.add_to_cart[0].name).toBe('Creamy Alfredo Pasta');
    });

    it('falls back to Zeenie when only ZEENIE_API_KEY is configured', async () => {
      process.env.ZEENIE_API_KEY = 'mock_zeenie_key';

      let fetchUrl = null;
      global.fetch = vi.fn().mockImplementation((url, options) => {
        fetchUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            response: {
              content: '{"text":"zeenie qr reply","add_to_cart":[]}',
            },
          }),
        });
      });

      const req = {
        method: 'POST',
        body: { message: 'menu options' },
      };
      const res = createMockRes();

      await qrAiHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(fetchUrl).toBe('https://zeenie-llm-api.zenotibeta.com/GenericLLM');
      expect(res.body.text).toBe('zeenie qr reply');
    });
  });
});
