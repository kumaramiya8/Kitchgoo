import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Sparkles, X, Send, Compass, Settings, AlertCircle, Check, ArrowRight, Package, Trash2, Bot, Cpu } from 'lucide-react';
import { Badge, Button, Card } from '@astryxdesign/core';
import { useApp } from '../../db/AppContext';
import { useNavigate } from 'react-router-dom';


const QuickPrompts = [
  { text: "📊 Analyze today's sales and performance", icon: "📊" },
  { text: "⚙️ Set service charge to 5% and enable it", icon: "⚙️" },
  { text: "📦 Show inventory low stock items", icon: "📦" },
  { text: "❓ How do I log a wastage entry?", icon: "❓" }
];

const parseMarkdown = (text) => {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Inline code `code`
  html = html.replace(/`(.*?)`/g, '<code style="background: rgba(30, 94, 74,0.08); color: #1e5e4a; padding: 2px 5px; borderRadius: 4px; font-family: monospace; font-size: 0.88em;">$1</code>');
  
  // Line breaks
  html = html.replace(/\n/g, '<br />');
  
  // Bullet lists
  html = html.replace(/^- (.*?)(?:<br \/>|$)/gm, '<li style="margin-left: 16px; margin-bottom: 4px; list-style-type: disc;">$1</li>');
  // Headers
  html = html.replace(/^### (.*?)(?:<br \/>|$)/gm, '<h5 style="font-size: 0.92rem; font-weight: 700; margin-top: 10px; margin-bottom: 6px; color: var(--primary);">$1</h5>');
  html = html.replace(/^## (.*?)(?:<br \/>|$)/gm, '<h4 style="font-size: 1.02rem; font-weight: 700; margin-top: 12px; margin-bottom: 8px; color: var(--primary);">$1</h4>');

  return html;
};

const HelpDrawer = ({ isOpen, onClose }) => {
  const { orders, inventory, staff, settings, wasteLog, menu, posTables, setPosTables, setPosSavedOrders, updateSettingsSection, editInventoryItem, addInventoryItem, addMenuItem, editMenuItem, recipes, addRecipe, editRecipe, fireToKDS, broadcastOrderCreated } = useApp();
  const navigate = useNavigate();
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('kitchgoo_copilot_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('[CO-PILOT] failed to restore messages:', e);
    }
    return [
      {
        sender: "ai",
        text: "Hello! I am your Kitchgoo AI Assistant. I can help you answer questions about how to use the app, change your settings using natural language, or analyze your sales, inventory, and staff data.\n\nWhat would you like to do today?",
        suggestions: []
      }
    ];
  });
  const [input, setInput] = useState("");

  useEffect(() => {
    try {
      // Keep last 50 messages
      const last50 = messages.slice(-50);
      localStorage.setItem('kitchgoo_copilot_messages', JSON.stringify(last50));
    } catch (e) {
      console.error('[CO-PILOT] failed to save messages:', e);
    }
  }, [messages]);

  const clearChat = () => {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
      localStorage.removeItem('kitchgoo_copilot_messages');
      setMessages([
        {
          sender: "ai",
          text: "Hello! I am your Kitchgoo AI Assistant. I can help you answer questions about how to use the app, change your settings using natural language, or analyze your sales, inventory, and staff data.\n\nWhat would you like to do today?",
          suggestions: []
        }
      ]);
    }
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Summarize current context to pass to Gemini
  const contextDataSnapshot = useMemo(() => {
    const currentPath = window.location.pathname + window.location.search;

    const settingsSummary = settings ? {
      restaurant: settings.restaurant ? {
        name: settings.restaurant.name,
        currency: settings.restaurant.currency,
        timezone: settings.restaurant.timezone,
        address: settings.restaurant.address,
      } : null,
      billing: settings.billing ? {
        gstRate: settings.billing.gstRate,
        serviceCharge: settings.billing.serviceCharge,
        enableServiceCharge: settings.billing.enableServiceCharge,
      } : null,
      payments: settings.payments ? {
        cash: settings.payments.cash,
        upi: settings.payments.upi,
        card: settings.payments.card,
      } : null,
      operations: settings.operations ? {
        tables: settings.operations.tables,
        openingTime: settings.operations.openingTime,
        closingTime: settings.operations.closingTime,
      } : null,
      menuCategories: settings.menuCategories || null,
    } : null;

    // Menu summary containing all items, categories, status, prices, and cost prices
    const menuSummary = (menu || []).map(m => ({
      name: m.name,
      price: m.price,
      costPrice: m.costPrice,
      category: m.category,
      active: m.active
    }));

    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = (orders || []).filter(o => o.createdAt && o.createdAt.startsWith(todayStr));
    const todayRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
    
    // Overall metrics & Item performance analytics
    const allOrders = orders || [];
    const overallRevenue = allOrders.reduce((s, o) => s + (o.total || 0), 0);
    const overallOrdersCount = allOrders.length;
    
    const itemSalesCount = {};
    const itemRevenue = {};
    const monthlySales = {};
    const paymentMethodsAll = { cash: 0, card: 0, upi: 0 };
    const orderTypesAll = {};

    allOrders.forEach(o => {
      // 1. Item sales counts
      if (Array.isArray(o.items)) {
        o.items.forEach(item => {
          const name = item.name;
          const qty = item.quantity || 1;
          const price = item.price || 0;
          itemSalesCount[name] = (itemSalesCount[name] || 0) + qty;
          itemRevenue[name] = (itemRevenue[name] || 0) + (qty * price);
        });
      }

      // 2. Historical sales aggregation
      const dateStr = o.createdAt ? o.createdAt.split('T')[0] : null;
      if (dateStr) {
        const month = dateStr.slice(0, 7); // YYYY-MM
        if (!monthlySales[month]) {
          monthlySales[month] = { revenue: 0, count: 0 };
        }
        monthlySales[month].revenue += (o.total || 0);
        monthlySales[month].count += 1;
      }

      // 3. Payment methods overall
      const pm = (o.paymentMethod || 'Cash').toLowerCase();
      if (pm.includes('cash')) paymentMethodsAll.cash += (o.total || 0);
      else if (pm.includes('card')) paymentMethodsAll.card += (o.total || 0);
      else paymentMethodsAll.upi += (o.total || 0);

      // 4. Order types overall
      const type = o.orderType || 'Dine-In';
      orderTypesAll[type] = (orderTypesAll[type] || 0) + (o.total || 0);
    });

    const topSellingItems = Object.entries(itemSalesCount)
      .map(([name, count]) => ({ name, count, revenue: itemRevenue[name] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Build compact recent orders list (last 300 orders)
    const maxCompactOrders = 300;
    const sortedOrders = [...allOrders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const compactRecentOrders = sortedOrders.slice(0, maxCompactOrders).map(o => {
      const item = {
        bill: o.billNo,
        date: o.createdAt ? o.createdAt.split('T')[0] : null,
        total: o.total,
        type: o.orderType,
        pm: o.paymentMethod,
        status: o.status,
        items: (o.items || []).map(i => `${i.name}x${i.quantity}`)
      };
      if (o.discount) item.disc = o.discount;
      if (o.comp) item.comp = o.comp;
      if (o.voidReason) item.voidR = o.voidReason;
      if (o.compReason) item.compR = o.compReason;
      return item;
    });

    const salesSummary = {
      todayOrdersCount: todayOrders.length,
      todayTotalRevenue: todayRevenue,
      todayAverageOrderValue: todayOrders.length > 0 ? (todayRevenue / todayOrders.length) : 0,
      overallOrdersCount,
      overallTotalRevenue: overallRevenue,
      overallAverageOrderValue: overallOrdersCount > 0 ? (overallRevenue / overallOrdersCount) : 0,
      topSellingItems,
      paymentMethodsBreakdown: todayOrders.reduce((acc, o) => {
        const method = (o.paymentMethod || 'Cash').toLowerCase();
        if (method.includes('cash')) acc.cash += (o.total || 0);
        else if (method.includes('card')) acc.card += (o.total || 0);
        else acc.upi += (o.total || 0);
        return acc;
      }, { cash: 0, card: 0, upi: 0 }),
      monthlySales,
      paymentMethodsAll,
      orderTypesAll,
      recentOrdersList: compactRecentOrders
    };

    const lowStockCount = (inventory || []).filter(i => (i.stock || 0) <= (i.min || 0)).length;
    const outOfStockCount = (inventory || []).filter(i => (i.stock || 0) <= 0).length;
    const lowStockItems = (inventory || []).filter(i => (i.stock || 0) <= (i.min || 0)).slice(0, 5).map(i => `${i.name} (${i.stock} ${i.unit || 'pcs'} left)`);
    
    const inventoryList = (inventory || []).map(i => ({
      name: i.name,
      category: i.category,
      stock: i.stock,
      unit: i.unit,
      min: i.min,
      cost: i.cost,
      supplier: i.supplier
    }));

    const inventorySummary = {
      totalItemsCount: (inventory || []).length,
      lowStockCount,
      outOfStockCount,
      lowStockItemsExample: lowStockItems,
      inventoryList
    };

    const staffSummary = {
      activeStaffCount: (staff || []).length,
      rolesCount: (staff || []).reduce((acc, s) => {
        const role = s.role || 'Staff';
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {}),
      staffList: (staff || []).map(s => ({
        name: s.name,
        role: s.role,
        status: s.status
      }))
    };

    const tablesSummary = {
      tablesList: (posTables || []).map(t => ({
        id: t.id,
        number: t.number,
        status: t.status,
        guestName: t.guestName,
        seatedAt: t.seatedAt
      }))
    };

    return {
      currentPath,
      settings: settingsSummary,
      menuSummary,
      salesSummary,
      inventorySummary,
      staffSummary,
      tablesSummary
    };
  }, [orders, inventory, staff, settings, wasteLog, menu, posTables]);

  const handleSendMessage = async (textToSend) => {
    const query = textToSend.trim();
    if (!query) return;

    // Append user message
    const userMsg = { sender: "user", text: query };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    // Prepare history to send to Gemini
    const chatHistory = messages.slice(1).map(m => ({
      sender: m.sender,
      text: m.text
    }));

    try {
      const response = await fetch('/api/help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: query,
          chatHistory,
          contextData: contextDataSnapshot
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Failed to get answer');
      }

      const reply = await response.json();
      
      setMessages(prev => [...prev, {
        sender: "ai",
        text: reply.text,
        suggestions: reply.suggestions || []
      }]);
    } catch (err) {
      console.error('[CO-PILOT] error sending query:', err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async (action, index, suggestionIndex) => {
    if (action.type === 'navigate') {
      navigate(action.path);
      onClose();
    } else if (action.type === 'update_setting') {
      try {
        const section = action.section;
        const data = action.data;
        
        await updateSettingsSection(section, data);
        
        // Show inline feedback in the chat message
        setMessages(prev => {
          const next = [...prev];
          const targetMsg = { ...next[index] };
          const targetSuggestions = [...targetMsg.suggestions];
          targetSuggestions[suggestionIndex] = {
            ...targetSuggestions[suggestionIndex],
            executed: true,
            statusText: "Applied!"
          };
          targetMsg.suggestions = targetSuggestions;
          next[index] = targetMsg;
          return next;
        });

      } catch (err) {
        console.error('[HELP DRAWER] Failed to apply settings update:', err);
        alert('Failed to apply settings change: ' + err.message);
      }
    } else if (action.type === 'seat_table_order') {
      try {
        const tableId = action.tableId;
        const guestName = action.guestName || 'Walk-in Guest';
        const itemsToAdd = action.items || [];
        
        // 1. Update the table seating status
        setPosTables(prev => prev.map(t => String(t.id) === String(tableId)
          ? {
              ...t,
              status: 'ordered',
              guestName: guestName,
              seatedAt: t.seatedAt || new Date().toISOString(),
            }
          : t
        ));

        // 2. Add the items to the table's saved order (cart)
        if (itemsToAdd.length > 0) {
          const posItems = itemsToAdd.map(item => {
            const menuMatch = (menu || []).find(m => m.id === item.id || m.name.toLowerCase() === item.name.toLowerCase());
            return {
              id: item.id || menuMatch?.id || `menu_${Date.now()}`,
              name: item.name,
              price: Number(item.price || menuMatch?.price || 0),
              qty: Number(item.qty || 1),
              _cartKey: `${item.id || 'item'}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              modifiers: [],
              specialInstructions: '',
              modifierGroups: menuMatch?.modifierGroups || [],
              course: 1,
              seat: 1
            };
          });

          setPosSavedOrders(prev => {
            const currentCart = prev[tableId] || [];
            return {
              ...prev,
              [tableId]: [...currentCart, ...posItems]
            };
          });

          // Fire to KDS so kitchen sees the order immediately
          const kdsOrderId = `COPILOT-${tableId}-${Date.now().toString().slice(-4)}`;
          await fireToKDS(kdsOrderId, posItems, tableId, 'dine-in');
          await broadcastOrderCreated(tableId, kdsOrderId);
          // Supabase does not echo broadcasts to the sender — dispatch locally
          // so KDS mounted in the same tab (e.g. multi-window staff flow) also reacts.
          window.dispatchEvent(new CustomEvent('kitchgoo_order_created', { detail: { tableId, kdsOrderId } }));
        }

        // Show inline feedback in the chat message
        setMessages(prev => {
          const next = [...prev];
          const targetMsg = { ...next[index] };
          const targetSuggestions = [...targetMsg.suggestions];
          targetSuggestions[suggestionIndex] = {
            ...targetSuggestions[suggestionIndex],
            executed: true,
            statusText: `Table Seated & Order Sent to Kitchen!`
          };
          targetMsg.suggestions = targetSuggestions;
          next[index] = targetMsg;
          return next;
        });

      } catch (err) {
        console.error('[HELP DRAWER] Failed to seat table or add items:', err);
        alert('Failed to seat table: ' + err.message);
      }
    } else if (action.type === 'bulk_update_stock') {
      try {
        const updates = action.updates || [];
        for (const updateItem of updates) {
          const invItem = (inventory || []).find(i => i.id === updateItem.id || i.name.toLowerCase() === updateItem.name.toLowerCase());
          if (invItem) {
            await editInventoryItem(invItem.id, {
              ...invItem,
              stock: Number(updateItem.stock),
              lastUpdated: new Date().toISOString()
            });
          }
        }

        // Show inline feedback in the chat message
        setMessages(prev => {
          const next = [...prev];
          const targetMsg = { ...next[index] };
          const targetSuggestions = [...targetMsg.suggestions];
          targetSuggestions[suggestionIndex] = {
            ...targetSuggestions[suggestionIndex],
            executed: true,
            statusText: `Stock Updated!`
          };
          targetMsg.suggestions = targetSuggestions;
          next[index] = targetMsg;
          return next;
        });

      } catch (err) {
        console.error('[HELP DRAWER] Failed to bulk update stock:', err);
        alert('Failed to update stock: ' + err.message);
      }
    } else if (action.type === 'bulk_add_menu_items') {
      try {
        const { newInventoryItems = [], menuItems = [] } = action;
        
        // 1. First add any new inventory items proposed
        const inventoryIdMap = {};
        for (const inv of newInventoryItems) {
          const added = await addInventoryItem({
            name: inv.name,
            category: inv.category || 'Raw Materials',
            stock: inv.stock || 0,
            unit: inv.unit || 'kg',
            min: inv.min || 5
          });
          if (added && added.id) {
             inventoryIdMap[inv.name.toLowerCase()] = { id: added.id, unit: added.unit };
          }
        }

        // 2. Add menu items and link ingredients
        for (const item of menuItems) {
          const linkedIngredients = (item.ingredients || []).map(ing => {
            // Find in our newly added items first
            let matchedId = inventoryIdMap[ing.name.toLowerCase()]?.id;
            let matchedUnit = inventoryIdMap[ing.name.toLowerCase()]?.unit || ing.unit;
            
            // If not found in newly added, try to find in existing inventory
            if (!matchedId) {
               const existing = (inventory || []).find(i => i.name.toLowerCase() === ing.name.toLowerCase());
               if (existing) {
                 matchedId = existing.id;
                 matchedUnit = existing.unit;
               }
            }

            return {
              itemId: matchedId || '', // could be empty if somehow not found/created, but AI should provide it in newInventoryItems
              qty: ing.qty || 0,
              unit: matchedUnit || ing.unit || ''
            };
          }).filter(ing => ing.itemId); // Ensure we don't link empty IDs if possible

          // Check if menu item exists
          const existingMenuItem = (menu || []).find(m => m.name.toLowerCase() === item.name.toLowerCase());
          let targetId = existingMenuItem?.id;

          if (existingMenuItem) {
            await editMenuItem(existingMenuItem.id, {
              ...existingMenuItem,
              calories: item.calories || existingMenuItem.calories,
              ingredients: linkedIngredients,
              image: item.image || existingMenuItem.image || ''
            });
          } else {
            const added = await addMenuItem({
              name: item.name,
              price: Number(item.price) || 0,
              category: item.category || 'Starters',
              subcategory: item.subcategory || '',
              reportingGroup: 'Food Sales',
              type: 'food',
              active: true,
              description: item.description || '',
              calories: item.calories || null,
              ingredients: linkedIngredients,
              image: item.image || ''
            });
            if (added && added.id) {
              targetId = added.id;
            }
          }

          // Also save/update the recipe for KDS lookup
          if (targetId) {
            const recipeIngredients = (item.ingredients || []).map(ing => ({
              name: ing.name,
              qty: Number(ing.qty) || 0,
              unit: ing.unit || ''
            }));

            const existingRecipe = (recipes || []).find(r => r.menuItemId === targetId || r.name.toLowerCase() === item.name.toLowerCase());
            if (existingRecipe) {
              await editRecipe(existingRecipe.id, {
                ...existingRecipe,
                menuItemId: targetId,
                name: item.name,
                prepTime: 15,
                ingredients: recipeIngredients,
                instructions: item.recipeInstructions || '',
                plating: item.recipePlating || ''
              });
            } else {
              await addRecipe({
                menuItemId: targetId,
                name: item.name,
                prepTime: 15,
                ingredients: recipeIngredients,
                instructions: item.recipeInstructions || '',
                plating: item.recipePlating || ''
              });
            }
          }
        }

        // Show inline feedback in the chat message
        setMessages(prev => {
          const next = [...prev];
          const targetMsg = { ...next[index] };
          const targetSuggestions = [...targetMsg.suggestions];
          targetSuggestions[suggestionIndex] = {
            ...targetSuggestions[suggestionIndex],
            executed: true,
            statusText: `Added ${menuItems.length} Menu Items & ${newInventoryItems.length} Ingredients!`
          };
          targetMsg.suggestions = targetSuggestions;
          next[index] = targetMsg;
          return next;
        });

      } catch (err) {
        console.error('[HELP DRAWER] Failed to bulk add menu items:', err);
        alert('Failed to add menu items: ' + err.message);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.15)',
          backdropFilter: 'blur(3px)',
          zIndex: 9998,
          transition: 'all 0.25s ease'
        }}
      />

      {/* Drawer */}
      <div 
        className="copilot-drawer"
        style={{
          position: 'fixed',
          top: '12px',
          bottom: '12px',
          right: '12px',
          width: 'min(380px, calc(100vw - 24px))',
          height: '100%',
          maxHeight: 'calc(100dvh - 24px)',
          background: 'var(--sidebar-bg)',
          backdropFilter: 'var(--blur-heavy)',
          WebkitBackdropFilter: 'var(--blur-heavy)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-2xl)',
          boxShadow: 'var(--shadow-sidebar)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'inherit',
          overflow: 'hidden',
          animation: 'slideIn 0.25s ease-out'
        }}
      >
        {/* CSS Animation rule */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(0,0,0,0.1);
            border-radius: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(0,0,0,0.2);
          }
          @media (max-width: 600px) {
            .copilot-drawer {
              top: 0 !important;
              bottom: 0 !important;
              right: 0 !important;
              width: 100vw !important;
              max-height: 100dvh !important;
              height: 100dvh !important;
              border-radius: 0 !important;
              border: none !important;
            }
          }
        `}} />

        {/* Drawer Header (aligned with sidebar logo style) */}
        <div 
          className="sidebar-logo"
          style={{
            padding: '22px 20px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '4px',
            background: 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="sidebar-logo-icon">
                <Sparkles size={18} />
              </div>
              <span className="sidebar-logo-text" style={{ fontSize: '1.05rem', fontWeight: 800 }}>Astryx AI Copilot</span>
              <Badge variant="primary" style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '12px' }}>AI Powered</Badge>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {messages.length > 1 && (
                <button 
                  onClick={clearChat}
                  title="Clear Chat History"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
                  onMouseOut={e => e.currentTarget.style.background = 'none'}
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button className="sidebar-close-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
          </div>
          <span 
            className="sidebar-logo-text" 
            style={{ 
              fontSize: '0.62rem', 
              color: 'var(--text-muted)', 
              fontWeight: 600, 
              letterSpacing: '0.05em', 
              paddingLeft: '46px', 
              textTransform: 'uppercase', 
              marginTop: '-4px' 
            }}
          >
            Astryx Design Automation &amp; Intelligence
          </span>
        </div>


        {/* Chat Thread */}
        <div 
          ref={scrollContainerRef}
          className="custom-scrollbar"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          {messages.map((msg, index) => {
            const isUser = msg.sender === 'user';
            return (
              <div 
                key={index}
                style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start'
                }}
              >
                {/* Bubble */}
                <div 
                  style={{
                    padding: '12px 16px',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: isUser ? 'var(--primary)' : 'rgba(255,255,255,0.85)',
                    color: isUser ? 'white' : 'var(--text-primary)',
                    fontSize: '0.85rem',
                    lineHeight: 1.45,
                    border: isUser ? 'none' : '1px solid var(--border-subtle)',
                    boxShadow: isUser ? '0 4px 12px rgba(30, 94, 74,0.15)' : '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                  dangerouslySetInnerHTML={{ __html: isUser ? msg.text : parseMarkdown(msg.text) }}
                />

                {/* Suggestions Cards */}
                {!isUser && msg.suggestions && msg.suggestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', width: '100%' }}>
                    {msg.suggestions.map((sug, sugIdx) => {
                      const isNav = sug.action.type === 'navigate';
                      const isStock = sug.action.type === 'bulk_update_stock';
                      const Icon = isNav ? Compass : (isStock ? Package : Settings);
                      return (
                        <div 
                          key={sugIdx}
                          style={{
                            background: 'rgba(255,255,255,0.7)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '12px',
                            padding: '10px 12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            animation: 'slideIn 0.2s ease-out'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: 24,
                              height: 24,
                              borderRadius: '6px',
                              background: isNav ? 'rgba(14,165,233,0.1)' : 'rgba(30, 94, 74,0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <Icon size={13} color={isNav ? '#0ea5e9' : '#1e5e4a'} />
                            </div>
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {isNav ? "AI Suggests Navigating" : 
                               (isStock ? "AI Suggests Stock Update" : 
                               (sug.action.type === 'bulk_add_menu_items' ? "AI Suggests Adding Menu Items" : "AI Suggests Setting Update"))}
                            </span>
                          </div>
                          
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                            {sug.label}
                          </div>

                          {/* Action details for settings update preview */}
                          {sug.action.type === 'update_setting' && !sug.executed && (
                            <div style={{ 
                              background: 'rgba(0,0,0,0.03)', 
                              padding: '6px 10px', 
                              borderRadius: '6px', 
                              fontSize: '0.7rem', 
                              fontFamily: 'monospace',
                              color: 'var(--text-muted)'
                            }}>
                              {JSON.stringify(sug.action.data, null, 1)}
                            </div>
                          )}

                          {sug.action.type === 'bulk_update_stock' && !sug.executed && (
                            <div style={{ 
                              background: 'rgba(0,0,0,0.03)', 
                              padding: '8px 12px', 
                              borderRadius: '8px', 
                              fontSize: '0.74rem', 
                              color: 'var(--text-secondary)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px'
                            }}>
                              {sug.action.updates.map((upd, idx) => {
                                const currentItem = (inventory || []).find(i => i.id === upd.id || i.name.toLowerCase() === upd.name.toLowerCase());
                                return (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600 }}>{upd.name}</span>
                                    <span style={{ fontSize: '0.7rem' }}>
                                      {currentItem ? `${currentItem.stock} → ` : ''}
                                      <strong style={{ color: 'var(--primary)', fontSize: '0.74rem' }}>{upd.stock} {currentItem?.unit || ''}</strong>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {sug.action.type === 'bulk_add_menu_items' && !sug.executed && (
                            <div style={{ 
                              background: 'rgba(0,0,0,0.03)', 
                              padding: '8px 12px', 
                              borderRadius: '8px', 
                              fontSize: '0.74rem', 
                              color: 'var(--text-secondary)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px'
                            }}>
                              {sug.action.menuItems?.map((mItem, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 600 }}>{mItem.name}</span>
                                  <span style={{ fontSize: '0.7rem' }}>
                                    <strong style={{ color: 'var(--primary)', fontSize: '0.74rem' }}>{settings?.restaurant?.currency || '$'}{mItem.price}</strong>
                                  </span>
                                </div>
                              ))}
                              {sug.action.newInventoryItems?.length > 0 && (
                                <div style={{ fontSize: '0.68rem', marginTop: '4px', color: 'var(--text-muted)' }}>
                                  + {sug.action.newInventoryItems.length} new inventory ingredients
                                </div>
                              )}
                            </div>
                          )}

                          {sug.executed ? (
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '4px', 
                              color: '#22c55e', 
                              fontSize: '0.75rem', 
                              fontWeight: 700, 
                              padding: '4px 0' 
                            }}>
                              <Check size={14} /> {sug.statusText || "Applied!"}
                            </div>
                          ) : (
                            <button
                              onClick={() => executeAction(sug.action, index, sugIdx)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                width: '100%',
                                padding: '6px 10px',
                                background: isNav ? '#0ea5e9' : '#1e5e4a',
                                border: 'none',
                                borderRadius: '8px',
                                color: 'white',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'opacity 0.2s'
                              }}
                              onMouseOver={e => e.currentTarget.style.opacity = 0.9}
                              onMouseOut={e => e.currentTarget.style.opacity = 1}
                            >
                              <span>{isNav ? "Go Now" : "Apply Changes"}</span>
                              <ArrowRight size={12} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.85)', padding: '10px 16px', borderRadius: '16px 16px 16px 4px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#1e5e4a', animation: 'bounce 1.4s infinite ease-in-out both' }} />
                <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#1e5e4a', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }} />
                <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#1e5e4a', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }} />
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Thinking...</span>
              <style dangerouslySetInnerHTML={{__html: `
                @keyframes bounce {
                  0%, 80%, 100% { transform: scale(0); }
                  40% { transform: scale(1.0); }
                }
              `}} />
            </div>
          )}

          {error && (
            <div style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'rgba(239,68,68,0.08)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#dc2626' }}>Error calling Copilot</span>
                <span style={{ fontSize: '0.75rem', color: '#b91c1c' }}>{error}</span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Actions Panel */}
        <div style={{
          padding: '8px 12px 0 12px',
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          background: 'rgba(255,255,255,0.7)',
          flexShrink: 0
        }} className="custom-scrollbar">
          {QuickPrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(p.text)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                background: 'white',
                border: '1px solid var(--border-subtle)',
                borderRadius: '20px',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                transition: 'all 0.2s',
                flexShrink: 0
              }}
              onMouseOver={e => {
                e.currentTarget.style.borderColor = 'var(--primary)';
                e.currentTarget.style.color = 'var(--primary)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <span>{p.icon}</span>
              <span>{p.text.slice(p.text.indexOf(" ") + 1)}</span>
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div style={{
          padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px)) 16px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(10px)',
          flexShrink: 0
        }}>
          <form 
            onSubmit={e => { e.preventDefault(); handleSendMessage(input); }}
            style={{
              display: 'flex',
              background: 'white',
              border: '1.5px solid var(--border-subtle)',
              borderRadius: '14px',
              padding: '4px 6px 4px 14px',
              alignItems: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
              transition: 'border-color 0.2s'
            }}
            onFocusWithin={e => e.currentTarget.style.borderColor = 'var(--primary)'}
          >
            <input 
              type="text" 
              placeholder="Ask copilot or command change..." 
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: '0.82rem',
                color: 'var(--text-primary)',
                background: 'transparent',
                padding: '8px 0'
              }}
            />
            <button 
              type="submit"
              disabled={!input.trim() || loading}
              style={{
                width: 32,
                height: 32,
                borderRadius: '10px',
                background: input.trim() && !loading ? 'var(--primary)' : 'rgba(0,0,0,0.05)',
                color: input.trim() && !loading ? 'white' : 'var(--text-muted)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                transition: 'all 0.2s'
              }}
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default HelpDrawer;
