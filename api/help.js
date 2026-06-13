export default async function handler(req, res) {
  // Read request method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse body
  let body;
  try {
    body = await getRequestBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON request body' });
  }

  const { message, chatHistory, contextData } = body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Groq API key is not configured on the server. Please check your environment variables.' });
  }

  try {
    // Construct payload for Gemini API
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

The response MUST be a JSON object with the following schema:
{
  "text": "Your markdown formatted response text here.",
  "suggestions": [
    {
      "label": "Brief label for the suggestion button (e.g., 'Seat Guest & Add Cold Coffee to Table 1')",
      "action": {
        "type": "navigate" | "update_setting" | "open_modal" | "seat_table_order",
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
        ]
      }
    }
  ]
}

Ensure the output is strictly valid JSON matching the above structure, and no other text is returned outside the JSON.`;

    const messagesList = [
      { role: 'system', content: systemPrompt }
    ];

    if (chatHistory && Array.isArray(chatHistory)) {
      chatHistory.forEach(msg => {
        messagesList.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        });
      });
    }
    
    // Add the new user query with context snapshot
    messagesList.push({
      role: 'user',
      content: `User query: "${message}"\n\nContext Data (current state of the application):\n${JSON.stringify(contextData || {}, null, 2)}`
    });

    // Call Groq API with retries
    const callGroqWithRetry = async () => {
      let retries = 2;
      let delay = 1000;
      let lastError = null;

      while (retries >= 0) {
        try {
          console.log(`[API] Querying Groq model llama-3.3-70b-versatile (retries left: ${retries})`);
          const response = await fetch(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: messagesList,
                response_format: {
                  type: 'json_object'
                },
                temperature: 0.1
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            const text = data.choices?.[0]?.message?.content;
            if (text) return text;
          }

          const errText = await response.text();
          lastError = new Error(`Groq API error: ${response.status} - ${errText}`);
          
          if (response.status !== 503 && response.status !== 429) {
            throw lastError; // Non-retryable error
          }
        } catch (err) {
          lastError = err;
        }

        if (retries > 0) {
          console.log(`[API] Temporary failure on Groq API, retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
        }
        retries--;
      }
      throw lastError || new Error('Groq API completions failed');
    };

    const responseText = await callGroqWithRetry();

    // Try parsing JSON response from Groq
    let resultObj;
    try {
      resultObj = JSON.parse(responseText);
    } catch (e) {
      console.warn('[API] Groq response was not valid JSON, returning raw text:', responseText);
      resultObj = {
        text: responseText,
        suggestions: []
      };
    }

    return res.status(200).json(resultObj);

  } catch (err) {
    console.error('[API] Error calling Groq API:', err);
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
