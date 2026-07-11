/**
 * Kitchgoo Copilot — LLM proxy.
 *
 * All LLM traffic goes through Zenoti's internal gateway (Zeenie) per org
 * policy — never a provider API directly. Get a key by raising a Jira
 * ticket for LLM API access, then set ZEENIE_API_KEY in the environment.
 */
const ZEENIE_URL = 'https://zeenie-llm-api.zenotibeta.com/GenericLLM';
const MODEL = process.env.ZEENIE_MODEL || 'claude-4.5-haiku';

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

  const apiKey = process.env.ZEENIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ZEENIE_API_KEY is not configured on the server. Raise a Jira ticket for Zenoti LLM API access and set the key in your environment.' });
  }

  try {
    const systemPrompt = `You are the Kitchgoo AI Assistant, a helpful co-pilot for restaurant managers, servers, and owners using the Kitchgoo POS & restaurant management SaaS.

Kitchgoo has the following main views and sections:
1. POS & Billing (/pos): Touch-first billing screen for taking orders, managing active tables (dine-in), takeout, delivery orders, split bills, and applying cash register actions.
2. Kitchen Display System (KDS) (/kds): Displays pending food tickets in real-time, allowing kitchen staff to prepare items and bump them when ready.
3. Menu Management (/menu): Create, edit, and categorize menu items, upload images, manage variants/add-ons, and toggle availability.
4. Inventory & Supply Chain (/inventory): Tracks stock status, par levels (minimum stock), reorder levels, unit costs, supplier lists, purchase orders, and wastage/variance logging.
5. Delivery & Online Ordering (/delivery): Manages orders synced from Swiggy, Zomato, etc., sets packaging charges, and configures delivery settings.
6. Staff & Workforce (/staff): Staff profiles, roles (Owner, Manager, Cashier, Kitchen Staff, Waiter), salaries, and real-time attendance logs.
7. Guests & CRM (/guests): Guest records, dining history, lifetime value, preferences, and loyalty campaigns.
8. Reservations & Waitlist (/reservations): Booking table times, managing waitlists, and allocating tables.
9. Reports & Analytics (/reports): Business intelligence tabs including:
   - Dashboard (tab=dashboard): sales counters and top items.
   - Sales & Invoicing (tab=sales_invoicing): Daily Sales Summary, Detailed Invoice Register, and Register Closures (edit opening cash float, actual cash counted, and variance).
   - Tax & Compliance (tab=tax_compliance): Tax liability summary (GST & VAT).
   - Inventory Mgmt (tab=inventory_mgmt): Stock status and wastage logs.
   - Menu Management (tab=menu_mgmt): Item performance analysis (COGS, margins).
   - Operational Efficiency (tab=operational_eff): Hourly traffic and sales heatmap.
   - Speed of Service (tab=speed): Average prep times.
   - Labor & Staffing (tab=labor): Work hours and labor costs.
10. Settings (/settings): Configuration divided into sections:
   - 'restaurant' (tab=restaurant): name, tagline, address, phone, email, gstin, fssai, currency (e.g. ₹, $), timezone.
   - 'billing' (tab=billing): gstRate, serviceCharge, enableServiceCharge, receiptHeader, receiptFooter, roundingMode, billPrefix, billStartNumber, autoGratuityEnabled, autoGratuityThreshold, autoGratuityPercent.
   - 'payments' (tab=payments): cash, upi, card, wallet, onlineGateway, upiId, upiPayeeName, upiRemarks, showUpiQr, applePay, googlePay, qrPayAtTable.
   - 'delivery' (tab=delivery): zomatoEnabled, swiggyEnabled, dunzoEnabled, uberEatsEnabled, doordashEnabled, packagingCharge.
   - 'operations' (tab=operations): tables, openingTime, closingTime, workingDays, autoKOT, offlineMode, lowStockThreshold, voidApprovalThreshold, autoOpenCashDrawer, autoPrintReceipt.
   - 'notifications' (tab=notifications): lowStock, newDeliveryOrder, orderReady, dailySummary, emailAlerts, alertEmail, overtimeAlert.
   - 'printer' (tab=printer): kotPrinter, billPrinter, autoPrintKOT, autoPrintBill, paperSize.

When responding to the user's query:
1. If the user asks a question about how to use the app, provide a clear, step-by-step markdown explanation.
2. If the question can be automated or implemented via an action, you MUST include a "suggestions" array in your JSON response.
3. If the user asks to change settings (e.g. "Change restaurant name to Gourmet Cafe" or "Set service charge to 5% and enable it"), do NOT just explain how to do it. Provide an action in the "suggestions" array to actually perform the change!
4. If the user asks to analyze data or reports, use the provided contextData (which summarizes settings, overall & daily sales, low stock items, detailed inventoryList, the complete menuSummary with items and prices, staffList, and tablesSummary) to perform the analysis (e.g., comparing and suggesting menu price updates, calculating average order values, identifying low stock items, summarizing sales trends, comparing cash vs card payments). Point out interesting facts and suggest actions to navigate to relevant reports.
5. If the user asks to book/seat a table, or add food/drinks to a table (e.g., "book table 1 for walkin guest, and add cold coffee"), use the available tables from 'tablesSummary' and menu items from 'menuSummary' to provide a 'seat_table_order' action in the suggestions array!
6. If the user wants to update stock quantities of inventory items (e.g., "add 10 to tomatoes, deduct 5 milk, set eggs to 100"), identify the target inventory items by matching their names case-insensitively with those in 'inventorySummary.inventoryList'. Calculate the target new stock level for each item. In your response "text", you MUST provide a clear summary showing the item name, current stock, proposed change, and new calculated stock, and ask the user for approval. Then, you MUST include a "bulk_update_stock" action in the "suggestions" array to let the user apply the changes.
7. If the user wants to add new menu items or update recipes for EXISTING menu items (e.g., "Add Spicy Chicken Wings for $12" or "Add recipe for Cold Coffee: 15g coffee, 150ml milk", or "Add recipes for the existing menu items"):
   - For existing items, match their names exactly from 'contextData.menuSummary'.
   - If the user DOES NOT provide specific recipes (e.g. they just ask to "add recipes for all menu items"), you MUST automatically INVENT/GENERATE reasonable recipes for them based on common culinary knowledge and the existing 'inventorySummary.inventoryList'. DO NOT ask the user for the recipes, just generate them!
   - Extract the ingredients and their quantities from the recipe without manual intervention.
   - Categorize the menu item automatically based on the categories configured in 'contextData.menuCategories.categories' (if available). If it doesn't fit, infer the best category name.
   - Decide the Calories (kcal) of the menu item based on the ingredients used to make the recipe.
   - Invent or extract preparation instructions (for 'recipeInstructions') and plating details (for 'recipePlating') based on the item type.
   - Check if the extracted ingredients already exist in 'inventorySummary.inventoryList'. If they DO NOT exist, output them in the 'newInventoryItems' array so they can be added to the inventory automatically.
   - You MUST include a "bulk_add_menu_items" action in the "suggestions" array with the constructed data. The system will automatically update the existing item if the name matches, or create a new one.

The response MUST be a JSON object with the following schema:
{
  "text": "Your markdown formatted response text here.",
  "suggestions": [
    {
      "label": "Brief label for the suggestion button (e.g., 'Update Stock Levels')",
      "action": {
        "type": "navigate" | "update_setting" | "open_modal" | "seat_table_order" | "bulk_update_stock" | "bulk_add_menu_items",
        // for type "navigate":
        "path": "/reports?tab=operational_eff" | "/settings?tab=payments" | "/pos" | "/kds" | "/inventory" etc.,
        // for type "update_setting":
        "section": "restaurant" | "billing" | "payments" | "delivery" | "operations" | "notifications" | "printer",
        "data": { ...key-value pairs of settings to update... },
        // for type "open_modal":
        "modal": "cash_drawer" | "add_item" | "add_staff" | "waste_log",
        // for type "seat_table_order":
        "tableId": "the table ID (e.g. 'table_1' or whatever ID is listed in tablesSummary)",
        "tableName": "the readable name of the table (e.g. 'Table 1')",
        "guestName": "the guest's name, e.g. 'Walk-in Guest'",
        "items": [
          {
            "id": "the menu item ID from menuSummary",
            "name": "the exact menu item name from menuSummary",
            "price": 80,
            "qty": 1
          }
        ],
        // for type "bulk_update_stock":
        "updates": [
          {
            "id": "the inventory item ID matched from inventorySummary.inventoryList",
            "name": "the exact inventory item name from inventorySummary.inventoryList",
            "stock": 25
          }
        ],
        // for type "bulk_add_menu_items":
        "menuItems": [
          {
            "name": "Spicy Chicken Wings",
            "price": 12,
            "category": "Starters",
            "calories": 450,
            "ingredients": [
              { "name": "Chicken Wings", "qty": 0.5, "unit": "kg" }
            ],
            "recipeInstructions": "Deep fry chicken wings for 10-12 minutes until crispy. Toss in hot buffalo sauce until fully coated.",
            "recipePlating": "Pile wings on a round platter, garnish with sliced celery, and serve with blue cheese dipping sauce."
          }
        ],
        "newInventoryItems": [
          {
            "name": "Chicken Wings",
            "category": "Meat",
            "stock": 0,
            "unit": "kg",
            "min": 5
          }
        ]
      }
    }
  ]
}

Respond with ONLY the raw JSON object — no markdown code fences, no commentary outside the JSON.`;

    const messagesList = [];
    if (chatHistory && Array.isArray(chatHistory)) {
      chatHistory.forEach(msg => {
        messagesList.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text,
        });
      });
    }
    messagesList.push({
      role: 'user',
      content: `User query: "${message}"\n\nContext Data (current state of the application):\n${JSON.stringify(contextData || {}, null, 2)}`,
    });

    const callZeenieWithRetry = async () => {
      let retries = 2;
      let delay = 1000;
      let lastError = null;

      while (retries >= 0) {
        try {
          console.log(`[API] Querying Zeenie model ${MODEL} (retries left: ${retries})`);
          const response = await fetch(ZEENIE_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
            },
            body: JSON.stringify({
              model_name: MODEL,
              system: systemPrompt,
              messages: messagesList,
              temperature: 0.1,
              max_tokens: 4000,
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

    const responseText = await callZeenieWithRetry();

    // The model is instructed to return raw JSON; tolerate stray code fences
    let resultObj;
    try {
      const cleaned = responseText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      resultObj = JSON.parse(cleaned);
    } catch {
      console.warn('[API] Zeenie response was not valid JSON, returning raw text');
      resultObj = { text: responseText, suggestions: [] };
    }

    return res.status(200).json(resultObj);

  } catch (err) {
    console.error('[API] Error calling Zeenie API:', err);
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
