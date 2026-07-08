import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, LayoutGrid, HelpCircle, Save, Info, RotateCcw } from 'lucide-react';
import { useApp } from '../../db/AppContext';

const CANVAS_WIDTH = 750;
const CANVAS_HEIGHT = 500;
const GRID_SIZE = 15;

const findFreeGridPosition = (existingTables, shape) => {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const x = c * 120 + 40;
      const y = r * 120 + 40;
      const collides = existingTables.some(t => {
        return Math.abs(t.x - x) < 90 && Math.abs(t.y - y) < 90;
      });
      if (!collides) {
        return { x, y };
      }
    }
  }
  return {
    x: Math.round((CANVAS_WIDTH / 2 - 45 + (Math.random() * 60 - 30)) / GRID_SIZE) * GRID_SIZE,
    y: Math.round((CANVAS_HEIGHT / 2 - 45 + (Math.random() * 60 - 30)) / GRID_SIZE) * GRID_SIZE
  };
};

export default function TableLayoutDesigner() {
  const { floorPlans, updateFloorPlans } = useApp();

  // Local state for designer edits
  const [tables, setTables] = useState([]);
  const [sections, setSections] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [activeFilterSection, setActiveFilterSection] = useState('All');

  // New section input
  const [newSectionName, setNewSectionName] = useState('');

  // New table form
  const [newTableNum, setNewTableNum] = useState('');
  const [newTableSeats, setNewTableSeats] = useState(4);
  const [newTableShape, setNewTableShape] = useState('square');
  const [newTableSection, setNewTableSection] = useState('');

  // Bulk state
  const [bulkStartNum, setBulkStartNum] = useState('');
  const [bulkCount, setBulkCount] = useState(5);
  const [bulkSeats, setBulkSeats] = useState(4);
  const [bulkShape, setBulkShape] = useState('square');
  const [bulkSection, setBulkSection] = useState('');
  const [bulkDeleteSection, setBulkDeleteSection] = useState('All');

  // Drag state
  const canvasRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [successMessage, setSuccessMessage] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync state from context
  useEffect(() => {
    if (floorPlans) {
      setTables(JSON.parse(JSON.stringify(floorPlans.tables || [])));
      const secs = floorPlans.sections || ['Main Dining', 'Private', 'Bar', 'Patio'];
      setSections(secs);
      if (secs.length > 0) {
        setNewTableSection(secs[0]);
        setBulkSection(secs[0]);
      }
    }
  }, [floorPlans]);

  // Toast helper
  const showToast = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // Drag & Drop handlers
  const handleMouseDown = (e, tableId) => {
    e.preventDefault();
    setSelectedTableId(tableId);
    setDraggingId(tableId);

    const table = tables.find(t => String(t.id) === String(tableId));
    if (!table) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;
    const mouseY = e.clientY - canvasRect.top;

    setDragOffset({
      x: mouseX - table.x,
      y: mouseY - table.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (draggingId === null) return;

      const canvasRect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - canvasRect.left;
      const mouseY = e.clientY - canvasRect.top;

      let newX = mouseX - dragOffset.x;
      let newY = mouseY - dragOffset.y;

      // Snapping to grid
      newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
      newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;

      // Constraints
      const table = tables.find(t => String(t.id) === String(draggingId));
      const size = table.shape === 'bar' ? 80 : 90; // Size on canvas
      newX = Math.max(0, Math.min(newX, CANVAS_WIDTH - size));
      newY = Math.max(0, Math.min(newY, CANVAS_HEIGHT - size));

      setTables(prev => prev.map(t => String(t.id) === String(draggingId) ? { ...t, x: newX, y: newY } : t));
    };

    const handleMouseUp = () => {
      if (draggingId !== null) {
        setDraggingId(null);
      }
    };

    if (draggingId !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId, dragOffset, tables]);

  // Section CRUD
  const handleAddSection = () => {
    const name = newSectionName.trim();
    if (!name) return;
    if (sections.includes(name)) {
      alert('Section already exists!');
      return;
    }
    const updated = [...sections, name];
    setSections(updated);
    setNewTableSection(name);
    setNewSectionName('');
    showToast(`Section "${name}" added!`);
  };

  const handleRemoveSection = (sectionName) => {
    if (confirm(`Are you sure you want to remove section "${sectionName}"? Tables in this section will be reassigned.`)) {
      const updatedSecs = sections.filter(s => s !== sectionName);
      setSections(updatedSecs);
      
      const defaultSec = updatedSecs[0] || 'Main Dining';
      setTables(prev => prev.map(t => t.section === sectionName ? { ...t, section: defaultSec } : t));
      
      if (activeFilterSection === sectionName) setActiveFilterSection('All');
      if (newTableSection === sectionName) setNewTableSection(defaultSec);
      
      showToast(`Section "${sectionName}" removed.`);
    }
  };

  // Table CRUD
  const handleAddTable = () => {
    const num = parseInt(newTableNum);
    if (isNaN(num) || num <= 0) {
      alert('Please enter a valid table number (e.g. 5)');
      return;
    }

    const exists = tables.some(t => String(t.id) === String(num) || String(t.number) === String(num));
    if (exists) {
      alert(`Table number ${num} already exists on the floor plan!`);
      return;
    }

    // Place new table in center-ish
    const newTable = {
      id: num,
      number: num,
      label: `Table ${num}`,
      shape: newTableShape,
      seats: parseInt(newTableSeats) || 4,
      section: newTableSection || sections[0] || 'Main Dining',
      x: Math.round((CANVAS_WIDTH / 2 - 45) / GRID_SIZE) * GRID_SIZE,
      y: Math.round((CANVAS_HEIGHT / 2 - 45) / GRID_SIZE) * GRID_SIZE,
      server: ''
    };

    setTables(prev => [...prev, newTable]);
    setSelectedTableId(newTable.id);
    setNewTableNum('');
    showToast(`Table ${num} added to floor!`);
  };

  const handleDeleteTable = (id) => {
    if (confirm(`Remove Table ${id} from layout?`)) {
      setTables(prev => prev.filter(t => String(t.id) !== String(id)));
      if (String(selectedTableId) === String(id)) setSelectedTableId(null);
      showToast(`Table ${id} removed.`);
    }
  };

  const handleBulkAdd = () => {
    const startNum = parseInt(bulkStartNum);
    const count = parseInt(bulkCount);
    if (isNaN(startNum) || startNum <= 0) {
      alert('Please enter a valid starting table number');
      return;
    }
    if (isNaN(count) || count <= 0 || count > 50) {
      alert('Please enter a count between 1 and 50');
      return;
    }

    const proposedTables = [];
    let tempTables = [...tables];

    for (let i = 0; i < count; i++) {
      const num = startNum + i;
      const exists = tempTables.some(t => String(t.id) === String(num) || String(t.number) === String(num));
      if (exists) {
        alert(`Table number ${num} already exists! Bulk add cancelled.`);
        return;
      }

      const { x, y } = findFreeGridPosition(tempTables, bulkShape);
      const newTable = {
        id: num,
        number: num,
        label: `Table ${num}`,
        shape: bulkShape,
        seats: parseInt(bulkSeats) || 4,
        section: bulkSection || sections[0] || 'Main Dining',
        x,
        y,
        server: ''
      };
      
      tempTables.push(newTable);
      proposedTables.push(newTable);
    }

    setTables(tempTables);
    setBulkStartNum('');
    showToast(`Successfully added ${count} tables to ${bulkSection || 'Main Dining'}!`);
  };

  const handleBulkDelete = () => {
    const targetSection = bulkDeleteSection;
    const targetTables = tables.filter(t => targetSection === 'All' || t.section === targetSection);

    if (targetTables.length === 0) {
      alert(`No tables found in section "${targetSection}".`);
      return;
    }

    if (confirm(`Are you sure you want to delete all ${targetTables.length} tables in "${targetSection}"?`)) {
      setTables(prev => prev.filter(t => targetSection !== 'All' && t.section !== targetSection));
      setSelectedTableId(null);
      showToast(`Removed ${targetTables.length} tables.`);
    }
  };

  // Edit selected table inline
  const updateSelectedTableField = (field, value) => {
    if (!selectedTableId) return;
    setTables(prev => prev.map(t => String(t.id) === String(selectedTableId) ? { ...t, [field]: value } : t));
  };

  // Save layout
  const handleSaveLayout = async () => {
    const data = {
      tables: tables.sort((a, b) => a.number - b.number),
      sections
    };
    await updateFloorPlans(data);
    showToast('Restaurant Floor Plan saved successfully!');
  };

  const handleResetLayout = () => {
    if (confirm('Are you sure you want to reset layout changes? This resets to the last saved plan.')) {
      setTables(JSON.parse(JSON.stringify(floorPlans?.tables || [])));
      setSections(floorPlans?.sections || []);
      setSelectedTableId(null);
      showToast('Layout changes reset.');
    }
  };

  // Render selected table edit panel
  const selectedTable = tables.find(t => String(t.id) === String(selectedTableId));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '320px 1fr', gap: '20px', height: '100%', minHeight: '620px' }}>
      {/* Toast Notification */}
      {successMessage && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, background: 'linear-gradient(135deg, #1e5e4a, #174b3b)',
          color: 'white', padding: '12px 20px', borderRadius: '12px', zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600,
          boxShadow: '0 8px 24px rgba(30, 94, 74,0.3)', fontSize: '0.85rem',
          animation: 'fadeUp 0.2s ease forwards'
        }}>
          <Save size={16} /> {successMessage}
        </div>
      )}

      {/* Control panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Sections list */}
        <div className="card" style={{ padding: '16px' }}>
          <h4 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.04em' }}>Dining Sections</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
            {sections.map(sec => (
              <div key={sec} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(255,255,255,0.4)', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.78rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sec}</span>
                {sections.length > 1 && (
                  <button onClick={() => handleRemoveSection(sec)} style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer' }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input className="input-field" placeholder="Add Area (e.g. Garden)" value={newSectionName} onChange={e => setNewSectionName(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.78rem' }} />
            <button className="btn btn-primary btn-sm" onClick={handleAddSection} style={{ padding: '6px 12px' }}><Plus size={14} /></button>
          </div>
        </div>

        {/* Add Table form */}
        <div className="card" style={{ padding: '16px' }}>
          <h4 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.04em' }}>Add New Table</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label" style={{ fontSize: '0.72rem' }}>Table No. *</label>
                <input className="input-field" type="number" placeholder="e.g. 15" value={newTableNum} onChange={e => setNewTableNum(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.78rem' }} />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label" style={{ fontSize: '0.72rem' }}>Seats *</label>
                <input className="input-field" type="number" min="1" value={newTableSeats} onChange={e => setNewTableSeats(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.78rem' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '8px' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label" style={{ fontSize: '0.72rem' }}>Shape</label>
                <select className="input-field" value={newTableShape} onChange={e => setNewTableShape(e.target.value)} style={{ padding: '5px 10px', fontSize: '0.78rem' }}>
                  <option value="square">Square</option>
                  <option value="round">Round</option>
                  <option value="bar">Bar (Pill)</option>
                </select>
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label" style={{ fontSize: '0.72rem' }}>Section</label>
                <select className="input-field" value={newTableSection} onChange={e => setNewTableSection(e.target.value)} style={{ padding: '5px 10px', fontSize: '0.78rem' }}>
                  {sections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <button className="btn btn-primary" onClick={handleAddTable} style={{ width: '100%', marginTop: '4px', padding: '8px 14px' }}>
              <Plus size={14} /> Add to Floor
            </button>
          </div>
        </div>

        {/* Bulk Operations */}
        <div className="card" style={{ padding: '16px' }}>
          <h4 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.04em' }}>Bulk Operations</h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            {/* Bulk Add Sub-section */}
            <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Bulk Add Tables</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" style={{ fontSize: '0.72rem' }}>Start No. *</label>
                  <input className="input-field" type="number" placeholder="e.g. 21" value={bulkStartNum} onChange={e => setBulkStartNum(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.78rem' }} />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" style={{ fontSize: '0.72rem' }}>Count *</label>
                  <input className="input-field" type="number" min="1" max="50" value={bulkCount} onChange={e => setBulkCount(parseInt(e.target.value) || 0)} style={{ padding: '6px 10px', fontSize: '0.78rem' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '8px', marginBottom: '8px' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" style={{ fontSize: '0.72rem' }}>Seats *</label>
                  <input className="input-field" type="number" min="1" value={bulkSeats} onChange={e => setBulkSeats(parseInt(e.target.value) || 4)} style={{ padding: '6px 10px', fontSize: '0.78rem' }} />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" style={{ fontSize: '0.72rem' }}>Shape</label>
                  <select className="input-field" value={bulkShape} onChange={e => setBulkShape(e.target.value)} style={{ padding: '5px 10px', fontSize: '0.78rem' }}>
                    <option value="square">Square</option>
                    <option value="round">Round</option>
                    <option value="bar">Bar (Pill)</option>
                  </select>
                </div>
              </div>
              <div className="input-group" style={{ marginBottom: '10px' }}>
                <label className="input-label" style={{ fontSize: '0.72rem' }}>Section</label>
                <select className="input-field" value={bulkSection} onChange={e => setBulkSection(e.target.value)} style={{ padding: '5px 10px', fontSize: '0.78rem', width: '100%' }}>
                  {sections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleBulkAdd} style={{ width: '100%', padding: '6px 12px' }}>
                <Plus size={13} /> Bulk Add Tables
              </button>
            </div>

            {/* Bulk Delete Sub-section */}
            <div>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Bulk Delete Tables</div>
              <div className="input-group" style={{ marginBottom: '10px' }}>
                <label className="input-label" style={{ fontSize: '0.72rem' }}>Target Area</label>
                <select className="input-field" value={bulkDeleteSection} onChange={e => setBulkDeleteSection(e.target.value)} style={{ padding: '5px 10px', fontSize: '0.78rem', width: '100%' }}>
                  <option value="All">All Areas</option>
                  {sections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={handleBulkDelete} style={{ width: '100%', padding: '6px 12px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                <Trash2 size={13} /> Bulk Delete Tables
              </button>
            </div>

          </div>
        </div>

        {/* Selected Table properties editor */}
        {selectedTable && (
          <div className="card" style={{ padding: '16px', border: '1px solid rgba(30, 94, 74,0.3)', background: 'rgba(30, 94, 74,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)' }}>Editing T{selectedTable.number}</h4>
              <button className="btn btn-secondary btn-sm" onClick={() => handleDeleteTable(selectedTableId)} style={{ padding: '3px 8px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" style={{ fontSize: '0.7rem' }}>Label</label>
                  <input className="input-field" value={selectedTable.label} onChange={e => updateSelectedTableField('label', e.target.value)} style={{ padding: '4px 8px', fontSize: '0.78rem' }} />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" style={{ fontSize: '0.7rem' }}>Seats</label>
                  <input className="input-field" type="number" value={selectedTable.seats} onChange={e => updateSelectedTableField('seats', parseInt(e.target.value) || 2)} style={{ padding: '4px 8px', fontSize: '0.78rem' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" style={{ fontSize: '0.7rem' }}>Shape</label>
                  <select className="input-field" value={selectedTable.shape} onChange={e => updateSelectedTableField('shape', e.target.value)} style={{ padding: '4px 8px', fontSize: '0.78rem' }}>
                    <option value="square">Square</option>
                    <option value="round">Round</option>
                    <option value="bar">Bar</option>
                  </select>
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label" style={{ fontSize: '0.7rem' }}>Section</label>
                  <select className="input-field" value={selectedTable.section} onChange={e => updateSelectedTableField('section', e.target.value)} style={{ padding: '4px 8px', fontSize: '0.78rem' }}>
                    {sections.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Info size={11} /> Drag the table on the canvas to relocate.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Editor Canvas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        
        {/* Canvas Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Section filter */}
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.4)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <button onClick={() => setActiveFilterSection('All')}
              style={{ padding: '4px 10px', border: 'none', cursor: 'pointer', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, background: activeFilterSection === 'All' ? 'var(--primary)' : 'transparent', color: activeFilterSection === 'All' ? 'white' : 'var(--text-secondary)' }}
            >All Areas</button>
            {sections.map(s => (
              <button key={s} onClick={() => setActiveFilterSection(s)}
                style={{ padding: '4px 10px', border: 'none', cursor: 'pointer', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, background: activeFilterSection === s ? 'var(--primary)' : 'transparent', color: activeFilterSection === s ? 'white' : 'var(--text-secondary)' }}
              >{s}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleResetLayout} style={{ gap: '4px', padding: '6px 12px' }}>
              <RotateCcw size={13} /> Reset Plan
            </button>
            <button className="btn btn-success btn-sm" onClick={handleSaveLayout} style={{ gap: '4px', padding: '6px 16px' }}>
              <Save size={13} /> Save Floor Plan
            </button>
          </div>
        </div>

        {/* Interactive Canvas container */}
        <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '8px' }}>
          <div
            ref={canvasRef}
            style={{
              position: 'relative',
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              background: 'var(--card-bg)',
              backdropFilter: 'blur(20px)',
              borderRadius: '18px',
              border: '1.5px solid var(--border-subtle)',
              boxShadow: 'inset 0 4px 16px rgba(0,0,0,0.02)',
              backgroundSize: `${GRID_SIZE * 2}px ${GRID_SIZE * 2}px`,
              backgroundImage: 'radial-gradient(rgba(30, 94, 74,0.06) 1.5px, transparent 0)',
              overflow: 'hidden',
            }}
          >
            {tables.filter(t => activeFilterSection === 'All' || t.section === activeFilterSection).map(table => {
              const isSelected = String(selectedTableId) === String(table.id);
              const size = table.shape === 'bar' ? 80 : 90;
              const borderCol = isSelected ? 'var(--primary)' : 'rgba(30, 94, 74,0.25)';
              const borderStyle = isSelected ? '2.5px solid' : '1.5px solid';
              const shadow = isSelected ? '0 8px 20px rgba(30, 94, 74,0.2)' : '0 2px 6px rgba(0,0,0,0.05)';
  
              return (
                <div
                  key={table.id}
                  onMouseDown={(e) => handleMouseDown(e, table.id)}
                  style={{
                    position: 'absolute',
                    left: table.x,
                    top: table.y,
                    width: size,
                    height: size,
                    background: 'white',
                    border: `${borderStyle} ${borderCol}`,
                    borderRadius: table.shape === 'round' ? '50%' : '14px',
                    boxShadow: shadow,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'move',
                    userSelect: 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    zIndex: isSelected ? 10 : 2,
                  }}
                >
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>T{table.number}</span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '1px' }}>{table.seats} Pax</span>
                  <span style={{ fontSize: '0.55rem', color: 'var(--primary)', fontWeight: 700, marginTop: '2px', background: 'rgba(30, 94, 74,0.06)', padding: '1px 5px', borderRadius: '4px', maxWidth: '78px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {table.section}
                  </span>
                </div>
              );
            })}
  
            {tables.filter(t => activeFilterSection === 'All' || t.section === activeFilterSection).length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                <LayoutGrid size={40} strokeWidth={1} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <div style={{ fontSize: '0.85rem' }}>No tables in this section. Add a table using the panel on the left.</div>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)', paddingLeft: '8px' }}>
          <HelpCircle size={12} />
          <span>Click a table to edit or delete it. Drag table shapes to map out your restaurant floor grid.</span>
        </div>
      </div>
    </div>
  );
}
