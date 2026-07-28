import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Sparkles, X, Send, Compass, Settings, AlertCircle, Check, ArrowRight, Package, Trash2, Bot, RefreshCw, Zap } from 'lucide-react';
import {
  ChatMessageList,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageMetadata,
  ChatSystemMessage,
  ChatComposer,
  ChatComposerInput,
  ChatSendButton,
  Badge,
  Button,
  Card,
  Token,
  StatusDot,
  Text,
  Stack,
  HStack,
  VStack
} from '@astryxdesign/core';
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
  html = html.replace(/`(.*?)`/g, '<code style="background: var(--color-surface-subtle, rgba(30,94,74,0.08)); color: var(--color-primary, #1e5e4a); padding: 2px 6px; borderRadius: 4px; font-family: monospace; font-size: 0.88em;">$1</code>');
  
  // Line breaks
  html = html.replace(/\n/g, '<br />');
  
  // Bullet lists
  html = html.replace(/^- (.*?)(?:<br \/>|$)/gm, '<li style="margin-left: 16px; margin-bottom: 4px; list-style-type: disc;">$1</li>');
  // Headers
  html = html.replace(/^### (.*?)(?:<br \/>|$)/gm, '<h5 style="font-size: 0.92rem; font-weight: 700; margin-top: 10px; margin-bottom: 6px; color: var(--color-primary, #1e5e4a);">$1</h5>');
  html = html.replace(/^## (.*?)(?:<br \/>|$)/gm, '<h4 style="font-size: 1.02rem; font-weight: 700; margin-top: 12px; margin-bottom: 8px; color: var(--color-primary, #1e5e4a);">$1</h4>');

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const scrollContainerRef = useRef(null);

  useEffect(() => {
    try {
      const last50 = messages.slice(-50);
      localStorage.setItem('kitchgoo_copilot_messages', JSON.stringify(last50));
    } catch (e) {
      console.error('[CO-PILOT] failed to save messages:', e);
    }
  }, [messages]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

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
    
    const allOrders = orders || [];
    const overallRevenue = allOrders.reduce((s, o) => s + (o.total || 0), 0);
    const overallOrdersCount = allOrders.length;
    
    const itemSalesCount = {};
    const itemRevenue = {};
    const monthlySales = {};
    const paymentMethodsAll = { cash: 0, card: 0, upi: 0 };
    const orderTypesAll = {};

    allOrders.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach(item => {
          const name = item.name;
          const qty = item.quantity || 1;
          const price = item.price || 0;
          itemSalesCount[name] = (itemSalesCount[name] || 0) + qty;
          itemRevenue[name] = (itemRevenue[name] || 0) + (qty * price);
        });
      }

      const dateStr = o.createdAt ? o.createdAt.split('T')[0] : null;
      if (dateStr) {
        const month = dateStr.slice(0, 7);
        if (!monthlySales[month]) {
          monthlySales[month] = { revenue: 0, count: 0 };
        }
        monthlySales[month].revenue += (o.total || 0);
        monthlySales[month].count += 1;
      }

      const pm = (o.paymentMethod || 'Cash').toLowerCase();
      if (pm.includes('cash')) paymentMethodsAll.cash += (o.total || 0);
      else if (pm.includes('card')) paymentMethodsAll.card += (o.total || 0);
      else paymentMethodsAll.upi += (o.total || 0);

      const type = o.orderType || 'Dine-In';
      orderTypesAll[type] = (orderTypesAll[type] || 0) + (o.total || 0);
    });

    const topSellingItems = Object.entries(itemSalesCount)
      .map(([name, count]) => ({ name, count, revenue: itemRevenue[name] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

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

    const userMsg = { sender: "user", text: query };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    const chatHistory = messages.slice(1).map(m => ({
      sender: m.sender,
      text: m.text
    }));

    try {
      const response = await fetch('/api/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        await updateSettingsSection(action.section, action.data);
        
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
        
        setPosTables(prev => prev.map(t => String(t.id) === String(tableId)
          ? {
              ...t,
              status: 'ordered',
              guestName: guestName,
              seatedAt: t.seatedAt || new Date().toISOString(),
            }
          : t
        ));

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
            const currentTableOrder = prev[tableId] || { items: [], notes: '' };
            const existingItems = currentTableOrder.items || [];
            const merged = [...existingItems];
            
            posItems.forEach(newItem => {
              const matchIndex = merged.findIndex(i => i.id === newItem.id && (!i.modifiers || i.modifiers.length === 0));
              if (matchIndex >= 0) {
                merged[matchIndex] = {
                  ...merged[matchIndex],
                  qty: (merged[matchIndex].qty || 1) + newItem.qty
                };
              } else {
                merged.push(newItem);
              }
            });

            return {
              ...prev,
              [tableId]: {
                ...currentTableOrder,
                items: merged
              }
            };
          });

          if (action.fireKDS) {
            const subtotal = posItems.reduce((acc, i) => acc + (i.price * i.qty), 0);
            const kdsOrder = {
              id: `ord_${Date.now()}`,
              billNo: `TBL-${tableId}`,
              orderType: 'Dine-In',
              tableNo: String(tableId),
              guestName,
              items: posItems,
              status: 'pending',
              subtotal,
              total: subtotal,
              createdAt: new Date().toISOString()
            };
            fireToKDS?.(kdsOrder);
            broadcastOrderCreated?.(kdsOrder);
          }
        }

        setMessages(prev => {
          const next = [...prev];
          const targetMsg = { ...next[index] };
          const targetSuggestions = [...targetMsg.suggestions];
          targetSuggestions[suggestionIndex] = {
            ...targetSuggestions[suggestionIndex],
            executed: true,
            statusText: `Table ${tableId} Seated!`
          };
          targetMsg.suggestions = targetSuggestions;
          next[index] = targetMsg;
          return next;
        });

      } catch (err) {
        console.error('[HELP DRAWER] Failed to seat table / create order:', err);
        alert('Failed to seat table: ' + err.message);
      }
    } else if (action.type === 'bulk_update_stock') {
      try {
        const updates = action.updates || [];
        for (const upd of updates) {
          const targetItem = (inventory || []).find(i => i.id === upd.id || i.name.toLowerCase() === upd.name.toLowerCase());
          if (targetItem) {
            await editInventoryItem(targetItem.id, { stock: Number(upd.stock) });
          }
        }

        setMessages(prev => {
          const next = [...prev];
          const targetMsg = { ...next[index] };
          const targetSuggestions = [...targetMsg.suggestions];
          targetSuggestions[suggestionIndex] = {
            ...targetSuggestions[suggestionIndex],
            executed: true,
            statusText: "Stock Updated!"
          };
          targetMsg.suggestions = targetSuggestions;
          next[index] = targetMsg;
          return next;
        });

      } catch (err) {
        console.error('[HELP DRAWER] Failed to update stock:', err);
        alert('Failed to update stock: ' + err.message);
      }
    } else if (action.type === 'bulk_add_menu_items') {
      try {
        const newInventoryItems = action.newInventoryItems || [];
        const menuItems = action.menuItems || [];
        const invIdMap = {};

        for (const inv of newInventoryItems) {
          const existingInv = (inventory || []).find(i => i.name.toLowerCase() === inv.name.toLowerCase());
          if (existingInv) {
            invIdMap[inv.name.toLowerCase()] = existingInv.id;
          } else {
            const addedInv = await addInventoryItem({
              name: inv.name,
              category: inv.category || 'General',
              stock: Number(inv.stock || 50),
              min: Number(inv.min || 10),
              unit: inv.unit || 'kg',
              cost: Number(inv.cost || 0),
              supplier: inv.supplier || 'Local Vendor'
            });
            if (addedInv && addedInv.id) {
              invIdMap[inv.name.toLowerCase()] = addedInv.id;
            }
          }
        }

        for (const menuItem of menuItems) {
          const existingMenu = (menu || []).find(m => m.name.toLowerCase() === menuItem.name.toLowerCase());
          const ingredientRefs = (menuItem.ingredients || []).map(ing => ({
            inventoryId: invIdMap[ing.name.toLowerCase()] || (inventory || []).find(i => i.name.toLowerCase() === ing.name.toLowerCase())?.id || '',
            name: ing.name,
            qty: Number(ing.qty || 1),
            unit: ing.unit || 'g'
          }));

          const menuPayload = {
            name: menuItem.name,
            category: menuItem.category || 'Main Course',
            price: Number(menuItem.price || 0),
            costPrice: Number(menuItem.costPrice || 0),
            description: menuItem.description || '',
            active: true,
            ingredients: ingredientRefs
          };

          let targetMenuId = null;
          if (existingMenu) {
            await editMenuItem(existingMenu.id, menuPayload);
            targetMenuId = existingMenu.id;
          } else {
            const addedMenu = await addMenuItem(menuPayload);
            if (addedMenu) targetMenuId = addedMenu.id;
          }

          if (ingredientRefs.length > 0 && targetMenuId) {
            const existingRecipe = (recipes || []).find(r => r.menuId === targetMenuId || r.menuName?.toLowerCase() === menuItem.name.toLowerCase());
            const recipePayload = {
              menuId: targetMenuId,
              menuName: menuItem.name,
              ingredients: ingredientRefs
            };

            if (existingRecipe) {
              await editRecipe(existingRecipe.id, recipePayload);
            } else {
              await addRecipe(recipePayload);
            }
          }
        }

        setMessages(prev => {
          const next = [...prev];
          const targetMsg = { ...next[index] };
          const targetSuggestions = [...targetMsg.suggestions];
          targetSuggestions[suggestionIndex] = {
            ...targetSuggestions[suggestionIndex],
            executed: true,
            statusText: "Menu Items & Recipes Added!"
          };
          targetMsg.suggestions = targetSuggestions;
          next[index] = targetMsg;
          return next;
        });

      } catch (err) {
        console.error('[HELP DRAWER] Failed to add menu items:', err);
        alert('Failed to add menu items: ' + err.message);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="sidebar-backdrop show" 
        onClick={onClose}
        style={{ zIndex: 9998 }}
      />

      <div 
        className="copilot-drawer animate-fade-in"
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          bottom: '16px',
          width: '430px',
          maxWidth: '92vw',
          background: 'var(--color-surface, #ffffff)',
          border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
          borderRadius: '24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <style dangerouslySetInnerHTML={{__html: `
          .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
            height: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(0,0,0,0.12);
            border-radius: 4px;
          }
          @media (max-width: 600px) {
            .copilot-drawer {
              top: 0 !important;
              bottom: 0 !important;
              right: 0 !important;
              width: 100vw !important;
              height: 100dvh !important;
              border-radius: 0 !important;
            }
          }
        `}} />

        {/* Drawer Header with Astryx Styling */}
        <VStack
          style={{
            padding: '20px 20px 16px',
            borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
            background: 'var(--color-surface-subtle, rgba(30,94,74,0.03))'
          }}
        >
          <HStack style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
            <HStack style={{ alignItems: 'center', gap: '10px' }}>
              <div 
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #1e5e4a, #2e7d5b)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(30,94,74,0.2)'
                }}
              >
                <Sparkles size={18} />
              </div>
              <Stack style={{ gap: '0' }}>
                <Text style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Astryx AI Copilot</Text>
                <HStack style={{ alignItems: 'center', gap: '4px', marginTop: '-2px' }}>
                  <StatusDot active={true} />
                  <Text style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Astryx Intelligence Active</Text>
                </HStack>
              </Stack>
            </HStack>
            <HStack style={{ alignItems: 'center', gap: '8px' }}>
              <Badge variant="primary" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>v0.1.9</Badge>
              {messages.length > 1 && (
                <Button
                  onClick={clearChat}
                  title="Clear Chat History"
                  style={{ background: 'transparent', border: 'none', padding: '6px', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <Trash2 size={16} />
                </Button>
              )}
              <Button
                onClick={onClose}
                style={{ background: 'transparent', border: 'none', padding: '6px', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </Button>
            </HStack>
          </HStack>
        </VStack>

        {/* Chat Thread using Astryx Chat Components */}
        <div 
          ref={scrollContainerRef}
          className="custom-scrollbar"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}
        >
          <ChatMessageList density="compact">
            {messages.map((msg, index) => {
              const isUser = msg.sender === 'user';
              return (
                <ChatMessage 
                  key={index}
                  sender={isUser ? 'user' : 'assistant'}
                  density="compact"
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start'
                  }}
                >
                  <ChatMessageBubble
                    sender={isUser ? 'user' : 'assistant'}
                    variant={isUser ? 'filled' : 'ghost'}
                    style={{
                      padding: '12px 16px',
                      borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isUser ? 'var(--color-primary, #1e5e4a)' : 'rgba(255,255,255,0.92)',
                      color: isUser ? '#ffffff' : 'var(--text-primary)',
                      fontSize: '0.84rem',
                      lineHeight: '1.45',
                      border: isUser ? 'none' : '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
                      boxShadow: isUser ? '0 4px 14px rgba(30,94,74,0.15)' : '0 2px 8px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div dangerouslySetInnerHTML={{ __html: isUser ? msg.text : parseMarkdown(msg.text) }} />
                  </ChatMessageBubble>

                  {/* Astryx Suggestions Cards */}
                  {!isUser && msg.suggestions && msg.suggestions.length > 0 && (
                    <Stack style={{ gap: '8px', marginTop: '10px', width: '100%' }}>
                      {msg.suggestions.map((sug, sugIdx) => {
                        const isNav = sug.action.type === 'navigate';
                        const isStock = sug.action.type === 'bulk_update_stock';
                        const Icon = isNav ? Compass : (isStock ? Package : Settings);
                        return (
                          <Card 
                            key={sugIdx}
                            style={{
                              background: 'rgba(255,255,255,0.95)',
                              border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
                              borderRadius: '14px',
                              padding: '12px',
                              boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px'
                            }}
                          >
                            <HStack style={{ alignItems: 'center', gap: '8px' }}>
                              <div style={{
                                width: 26,
                                height: 26,
                                borderRadius: '8px',
                                background: isNav ? 'rgba(14,165,233,0.1)' : 'rgba(30,94,74,0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                <Icon size={14} color={isNav ? '#0ea5e9' : '#1e5e4a'} />
                              </div>
                              <Text style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {isNav ? "AI Suggests Navigating" : 
                                 (isStock ? "AI Suggests Stock Update" : 
                                 (sug.action.type === 'bulk_add_menu_items' ? "AI Suggests Adding Menu Items" : "AI Suggests Setting Update"))}
                              </Text>
                            </HStack>
                            
                            <Text style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                              {sug.label}
                            </Text>

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
                              <Stack style={{ 
                                gap: '4px',
                                background: 'rgba(0,0,0,0.03)', 
                                padding: '8px 12px', 
                                borderRadius: '8px', 
                                fontSize: '0.74rem' 
                              }}>
                                {sug.action.updates.map((upd, idx) => {
                                  const currentItem = (inventory || []).find(i => i.id === upd.id || i.name.toLowerCase() === upd.name.toLowerCase());
                                  return (
                                    <HStack key={idx} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                      <Text style={{ fontWeight: 600 }}>{upd.name}</Text>
                                      <Text style={{ fontSize: '0.7rem' }}>
                                        {currentItem ? `${currentItem.stock} → ` : ''}
                                        <strong style={{ color: 'var(--color-primary, #1e5e4a)', fontSize: '0.74rem' }}>{upd.stock} {currentItem?.unit || ''}</strong>
                                      </Text>
                                    </HStack>
                                  );
                                })}
                              </Stack>
                            )}

                            {sug.action.type === 'bulk_add_menu_items' && !sug.executed && (
                              <Stack style={{ 
                                gap: '4px',
                                background: 'rgba(0,0,0,0.03)', 
                                padding: '8px 12px', 
                                borderRadius: '8px', 
                                fontSize: '0.74rem' 
                              }}>
                                {sug.action.menuItems?.map((mItem, idx) => (
                                  <HStack key={idx} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ fontWeight: 600 }}>{mItem.name}</Text>
                                    <Text style={{ fontSize: '0.7rem' }}>
                                      <strong style={{ color: 'var(--color-primary, #1e5e4a)', fontSize: '0.74rem' }}>{settings?.restaurant?.currency || '$'}{mItem.price}</strong>
                                    </Text>
                                  </HStack>
                                ))}
                              </Stack>
                            )}

                            {sug.executed ? (
                              <HStack style={{ alignItems: 'center', gap: '4px', color: '#22c55e', fontSize: '0.75rem', fontWeight: 700, padding: '4px 0' }}>
                                <Check size={14} /> {sug.statusText || "Applied!"}
                              </HStack>
                            ) : (
                              <Button
                                onClick={() => executeAction(sug.action, index, sugIdx)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  width: '100%',
                                  padding: '7px 12px',
                                  background: isNav ? '#0ea5e9' : 'var(--color-primary, #1e5e4a)',
                                  border: 'none',
                                  borderRadius: '8px',
                                  color: 'white',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                <span>{isNav ? "Go Now" : "Apply Changes"}</span>
                                <ArrowRight size={12} />
                              </Button>
                            )}
                          </Card>
                        );
                      })}
                    </Stack>
                  )}
                </ChatMessage>
              );
            })}

            {loading && (
              <ChatSystemMessage variant="default">
                <HStack style={{ alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.85)', padding: '8px 14px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                  <RefreshCw size={14} className="spin" style={{ color: 'var(--color-primary, #1e5e4a)' }} />
                  <Text style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Astryx Copilot is thinking...</Text>
                </HStack>
              </ChatSystemMessage>
            )}

            {error && (
              <ChatSystemMessage variant="default">
                <HStack style={{ alignItems: 'center', gap: '8px', background: 'rgba(239,68,68,0.08)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertCircle size={16} color="#ef4444" />
                  <Text style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600 }}>{error}</Text>
                </HStack>
              </ChatSystemMessage>
            )}
          </ChatMessageList>

          <div ref={scrollContainerRef} />
        </div>

        {/* Quick Prompts Bar using Astryx Tokens */}
        <HStack 
          style={{
            gap: '8px',
            padding: '8px 12px',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            background: 'rgba(255,255,255,0.8)',
            borderTop: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
            flexShrink: 0
          }} 
          className="custom-scrollbar"
        >
          {QuickPrompts.map((p, i) => (
            <Token
              key={i}
              onClick={() => handleSendMessage(p.text)}
              style={{
                cursor: 'pointer',
                fontSize: '0.74rem',
                fontWeight: 600,
                padding: '5px 12px',
                borderRadius: '16px',
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--border-subtle, rgba(0,0,0,0.1))',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                flexShrink: 0
              }}
            >
              <span>{p.icon}</span>
              <span style={{ marginLeft: 4 }}>{p.text.slice(p.text.indexOf(" ") + 1)}</span>
            </Token>
          ))}
        </HStack>

        {/* Astryx Chat Composer Bar */}
        <div style={{
          padding: '14px 16px calc(14px + env(safe-area-inset-bottom, 0px)) 16px',
          borderTop: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(10px)',
          flexShrink: 0
        }}>
          <form 
            onSubmit={e => { e.preventDefault(); handleSendMessage(input); }}
            style={{
              display: 'flex',
              background: 'var(--color-surface, #ffffff)',
              border: '1.5px solid var(--border-subtle, rgba(0,0,0,0.15))',
              borderRadius: '14px',
              padding: '4px 6px 4px 14px',
              alignItems: 'center',
              boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
              transition: 'border-color 0.2s'
            }}
            onFocusWithin={e => e.currentTarget.style.borderColor = 'var(--color-primary, #1e5e4a)'}
          >
            <input 
              type="text" 
              placeholder="Ask Astryx Copilot or command a change..." 
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
            <Button 
              type="submit"
              disabled={!input.trim() || loading}
              style={{
                width: 32,
                height: 32,
                borderRadius: '10px',
                background: input.trim() && !loading ? 'var(--color-primary, #1e5e4a)' : 'rgba(0,0,0,0.05)',
                color: input.trim() && !loading ? '#ffffff' : 'var(--text-muted)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                padding: 0
              }}
            >
              <Send size={14} />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
};

export default HelpDrawer;
