
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { HistoryItem, NoteMode } from '../types';
import { StorageService } from '../services/storageService';
import { ZoomIn, ZoomOut, RefreshCw, Maximize2, Search, Filter, Trash2, FileText, X, Share2, Focus, GripHorizontal } from 'lucide-react';

interface GraphViewProps {
  onSelectNote: (note: HistoryItem) => void;
}

interface Node {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  label: string;
  data: HistoryItem;
}

interface Link {
  source: string;
  target: string;
  sourceNode?: Node;
  targetNode?: Node;
  strength: number;
}

// Utility: Consistent color generation based on string
const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 70%, 50%)`; // HSL for better control in Light/Dark modes
};

const GraphView: React.FC<GraphViewProps> = ({ onSelectNote }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // UX State
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, node: Node} | null>(null);
  const [spotlightNode, setSpotlightNode] = useState<string | null>(null); // ID of focused node
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // For mobile controls

  // Physics State
  const nodesRef = useRef<Node[]>([]);
  const linksRef = useRef<Link[]>([]);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 0.8 }); // Pan/Zoom
  
  // Interaction Refs
  const isDragging = useRef(false);
  const dragNode = useRef<Node | null>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  
  // Touch Refs (Pinch Zoom)
  const lastTouchDistance = useRef<number | null>(null);
  
  const animationRef = useRef<number>(0);
  const storage = useMemo(() => StorageService.getInstance(), []);

  // --- 1. DATA LOADING & TOPOLOGY ---
  const loadData = useCallback(async () => {
    const data = await storage.getUnifiedNotes();
    initSimulation(data);
  }, [storage]);

  useEffect(() => {
    loadData();
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        // High DPI scaling for crisp text on mobile
        const dpr = window.devicePixelRatio || 1;
        const rect = containerRef.current.getBoundingClientRect();
        
        canvasRef.current.width = rect.width * dpr;
        canvasRef.current.height = rect.height * dpr;
        canvasRef.current.style.width = `${rect.width}px`;
        canvasRef.current.style.height = `${rect.height}px`;
        
        // Center initial view
        setTransform(prev => ({ ...prev, x: rect.width / 2, y: rect.height / 2 }));
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [loadData]);

  const initSimulation = (items: HistoryItem[]) => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const existingNodesMap = new Map<string, Node>();
    nodesRef.current.forEach(n => existingNodesMap.set(n.id, n));
    
    const newNodes: Node[] = items.map(item => {
      const existing = existingNodesMap.get(item.id);
      // Auto-color based on Tags or Mode
      let nodeColor = item.mode === NoteMode.CHEAT_CODES ? '#f59e0b' : '#3b82f6';
      if (item.tags && item.tags.length > 0) nodeColor = stringToColor(item.tags[0]);

      return {
        id: item.id,
        x: existing ? existing.x : (Math.random() - 0.5) * width * 0.2,
        y: existing ? existing.y : (Math.random() - 0.5) * height * 0.2,
        vx: existing ? existing.vx : 0,
        vy: existing ? existing.vy : 0,
        radius: Math.max(15, Math.min(40, 15 + (item.tags?.length || 0) * 3)), // Larger tap targets for mobile
        color: nodeColor, 
        label: item.topic,
        data: item,
      };
    });

    const newLinks: Link[] = [];
    for (let i = 0; i < newNodes.length; i++) {
      for (let j = i + 1; j < newNodes.length; j++) {
        const a = newNodes[i];
        const b = newNodes[j];
        
        // Link Logic: Shared Tags OR Reference in Text
        const sharedTags = (a.data.tags || []).filter(t => (b.data.tags || []).includes(t));
        const refLink = a.data.content.includes(b.data.topic) || b.data.content.includes(a.data.topic);

        if (sharedTags.length > 0 || refLink) {
          newLinks.push({
            source: a.id,
            target: b.id,
            sourceNode: a,
            targetNode: b,
            strength: refLink ? 0.8 : 0.2
          });
        }
      }
    }

    nodesRef.current = newNodes;
    linksRef.current = newLinks;
  };

  // --- 2. RENDER LOOP (THEME AWARE) ---
  useEffect(() => {
    let isRunning = true;

    // Get CSS Variables for Theme
    const computedStyle = getComputedStyle(document.body);
    const getVar = (name: string) => computedStyle.getPropertyValue(name).trim();

    const tick = () => {
      if (!isRunning || !canvasRef.current) return;
      
      // Update Physics
      const nodes = nodesRef.current;
      const links = linksRef.current;
      
      // Physics Constants
      const REPULSION = 1000;
      const SPRING_LEN = 120;
      const CENTER_GRAVITY = 0.002;
      const DT = 0.5;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx*dx + dy*dy || 1;
          const dist = Math.sqrt(distSq);
          if (dist < 800) {
            const f = REPULSION / distSq;
            a.vx += (dx/dist)*f; a.vy += (dy/dist)*f;
            b.vx -= (dx/dist)*f; b.vy -= (dy/dist)*f;
          }
        }
      }

      links.forEach(l => {
        if (!l.sourceNode || !l.targetNode) return;
        const dx = l.targetNode.x - l.sourceNode.x;
        const dy = l.targetNode.y - l.sourceNode.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const f = (dist - SPRING_LEN) * 0.01;
        const fx = (dx/dist)*f; const fy = (dy/dist)*f;
        l.sourceNode.vx += fx; l.sourceNode.vy += fy;
        l.targetNode.vx -= fx; l.targetNode.vy -= fy;
      });

      nodes.forEach(n => {
        if (n === dragNode.current) return;
        n.vx -= n.x * CENTER_GRAVITY; n.vy -= n.y * CENTER_GRAVITY;
        n.vx *= 0.85; n.vy *= 0.85; // Friction
        n.x += n.vx * DT; n.y += n.vy * DT;
      });

      // DRAW
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      
      const dpr = window.devicePixelRatio || 1;
      const width = canvasRef.current.width / dpr;
      const height = canvasRef.current.height / dpr;

      // Theme Colors
      const bg = getVar('--ui-bg') || '#ffffff';
      const textMain = getVar('--ui-text-main') || '#0f172a';
      const textMuted = getVar('--ui-text-muted') || '#64748b';
      const primary = getVar('--ui-primary') || '#2563eb';

      // Clear
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      
      // Transform Camera
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      // Links
      links.forEach(l => {
        if (!l.sourceNode || !l.targetNode) return;
        
        // Spotlight Logic: Hide links not connected to focused node
        const isConnectedToSpotlight = spotlightNode && (l.source === spotlightNode || l.target === spotlightNode);
        if (spotlightNode && !isConnectedToSpotlight) {
            ctx.globalAlpha = 0.05;
        } else {
            ctx.globalAlpha = 0.2;
        }

        ctx.beginPath();
        ctx.moveTo(l.sourceNode.x, l.sourceNode.y);
        ctx.lineTo(l.targetNode.x, l.targetNode.y);
        ctx.strokeStyle = textMain;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // Nodes
      nodes.forEach(n => {
        // Search Filter
        const isMatch = !searchQuery || n.label.toLowerCase().includes(searchQuery.toLowerCase());
        
        // Spotlight Filter
        const isSpotlight = n.id === spotlightNode;
        const isNeighbor = spotlightNode && links.some(l => (l.source === spotlightNode && l.target === n.id) || (l.target === spotlightNode && l.source === n.id));
        
        let alpha = 1;
        if (searchQuery && !isMatch) alpha = 0.1;
        if (spotlightNode && !isSpotlight && !isNeighbor) alpha = 0.1;

        ctx.globalAlpha = alpha;

        // Shadow/Glow
        if (isSpotlight || (searchQuery && isMatch)) {
            ctx.shadowColor = n.color;
            ctx.shadowBlur = 20;
        } else {
            ctx.shadowBlur = 0;
        }

        // Body
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.lineWidth = isSpotlight ? 4 : 2;
        ctx.strokeStyle = n.color;
        ctx.stroke();

        // Label (LOD: Show only if zoomed in, spotlighted, or matches search)
        if (transform.k > 0.6 || isSpotlight || isNeighbor || (searchQuery && isMatch)) {
            ctx.shadowBlur = 0; // Reset shadow for text
            ctx.font = `bold 12px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Label Background
            const textWidth = ctx.measureText(n.label).width;
            ctx.fillStyle = bg;
            ctx.globalAlpha = alpha * 0.8;
            ctx.fillRect(n.x - textWidth/2 - 4, n.y + n.radius + 4, textWidth + 8, 18);
            
            ctx.fillStyle = textMain;
            ctx.globalAlpha = alpha;
            ctx.fillText(n.label, n.x, n.y + n.radius + 13);
        }
      });

      ctx.globalAlpha = 1;
      animationRef.current = requestAnimationFrame(tick);
    };

    tick();
    return () => isRunning = false;
  }, [transform, spotlightNode, searchQuery]);

  // --- 3. INPUT HANDLERS (TOUCH & MOUSE) ---

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    let cx, cy;
    
    if ('touches' in e) {
       cx = e.touches[0].clientX;
       cy = e.touches[0].clientY;
    } else {
       cx = (e as React.MouseEvent).clientX;
       cy = (e as React.MouseEvent).clientY;
    }
    
    // World Coords
    const x = (cx - rect.left - transform.x) / transform.k;
    const y = (cy - rect.top - transform.y) / transform.k;
    return { x, y, cx, cy };
  };

  const getNodeAt = (x: number, y: number) => {
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const dist = Math.sqrt((n.x - x)**2 + (n.y - y)**2);
      if (dist < n.radius + 10) return n; // Hit tolerance
    }
    return null;
  };

  // TOUCH START
  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    // 0. Close menu
    if (contextMenu) setContextMenu(null);

    // 1. Pinch Zoom Check
    if ('touches' in e && e.touches.length === 2) {
       const dx = e.touches[0].clientX - e.touches[1].clientX;
       const dy = e.touches[0].clientY - e.touches[1].clientY;
       lastTouchDistance.current = Math.sqrt(dx*dx + dy*dy);
       return; 
    }

    const { x, y, cx, cy } = getPos(e);
    const node = getNodeAt(x, y);

    // 2. Node Interaction
    if (node) {
       isDragging.current = true;
       dragNode.current = node;
       dragStartPos.current = { x: cx, y: cy };
       
       // Spotlight Effect Logic
       setSpotlightNode(node.id);
    } 
    // 3. Pan Background
    else {
       isDragging.current = true; // reusing flag for panning
       dragNode.current = null;
       dragStartPos.current = { x: cx, y: cy };
       // Clear spotlight if clicking bg
       if (spotlightNode) setSpotlightNode(null);
    }
  };

  // TOUCH MOVE
  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    // 1. Pinch Zoom Logic
    if ('touches' in e && e.touches.length === 2 && lastTouchDistance.current) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const delta = dist - lastTouchDistance.current;
        
        // Apply Zoom
        const zoomSpeed = 0.005;
        const newK = Math.max(0.2, Math.min(3, transform.k + delta * zoomSpeed));
        setTransform(prev => ({ ...prev, k: newK }));
        
        lastTouchDistance.current = dist;
        return;
    }

    if (!isDragging.current) return;

    const { x, y, cx, cy } = getPos(e);
    const dx = cx - dragStartPos.current.x;
    const dy = cy - dragStartPos.current.y;

    // Node Drag
    if (dragNode.current) {
       dragNode.current.x = x;
       dragNode.current.y = y;
       dragNode.current.vx = 0; 
       dragNode.current.vy = 0;
    } 
    // Canvas Pan
    else {
       setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
       dragStartPos.current = { x: cx, y: cy };
    }
  };

  // TOUCH END
  const handleEnd = (e: React.TouchEvent | React.MouseEvent) => {
    lastTouchDistance.current = null;
    isDragging.current = false;

    // Check for "Click" vs "Drag"
    if (dragNode.current) {
        const { cx, cy } = 'touches' in e ? { cx: e.changedTouches[0].clientX, cy: e.changedTouches[0].clientY } : { cx: (e as React.MouseEvent).clientX, cy: (e as React.MouseEvent).clientY };
        const dist = Math.sqrt((cx - dragStartPos.current.x)**2 + (cy - dragStartPos.current.y)**2);
        
        // If movement < 5px, treat as click
        if (dist < 5) {
            // Mobile: Double Tap to Open? Or single tap focus, long press menu?
            // For now: Single tap sets focus (already done in Start). 
            // We can add a button in UI to "Open Focused Note"
        }
        dragNode.current = null;
    }
  };

  // CONTEXT MENU (Long Press Simulation or Right Click)
  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      const { x, y } = getPos(e);
      const node = getNodeAt(x, y);
      if (node) {
          setContextMenu({ x: e.clientX, y: e.clientY, node });
      }
  };

  return (
    <div className="w-full h-full relative bg-[var(--ui-bg)] overflow-hidden touch-none select-none">
        
        {/* CANVAS LAYER */}
        <canvas 
            ref={canvasRef}
            className="absolute inset-0 block cursor-grab active:cursor-grabbing"
            onMouseDown={handleStart}
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
            onContextMenu={handleContextMenu}
        />

        {/* --- MOBILE/DESKTOP HUD --- */}
        
        {/* 1. Top Bar: Search & Status */}
        <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start pointer-events-none">
            <div className="flex flex-col gap-2 pointer-events-auto w-full max-w-xs">
                {/* Glass Panel */}
                <div className="bg-[var(--ui-surface)]/80 backdrop-blur-md border border-[var(--ui-border)] p-3 rounded-2xl shadow-xl flex items-center gap-3">
                    <div className="p-2 bg-[var(--ui-primary)] text-white rounded-xl shadow-lg shadow-blue-500/30">
                        <Maximize2 size={18} />
                    </div>
                    <div>
                        <h2 className="text-xs font-bold text-[var(--ui-text-main)] uppercase tracking-wider">Synapse Graph</h2>
                        <p className="text-[10px] text-[var(--ui-text-muted)]">{nodesRef.current.length} Nodes Active</p>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="bg-[var(--ui-surface)]/90 backdrop-blur-md border border-[var(--ui-border)] p-1 rounded-xl flex items-center shadow-lg transition-all focus-within:ring-2 ring-[var(--ui-primary)]/50">
                    <Search size={14} className="text-[var(--ui-text-muted)] ml-2" />
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter nodes..."
                        className="bg-transparent border-none outline-none text-xs text-[var(--ui-text-main)] p-2 w-full placeholder:text-[var(--ui-text-muted)]"
                    />
                    {searchQuery && <button onClick={() => setSearchQuery('')} className="p-1 hover:bg-[var(--ui-bg)] rounded-full text-[var(--ui-text-muted)]"><X size={12}/></button>}
                </div>
            </div>
        </div>

        {/* 2. Bottom Controls (Mobile Friendly) */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4 z-20 pointer-events-none px-6">
            
            {/* Dynamic Action Button (Appears when node selected) */}
            {spotlightNode && (
                <div className="pointer-events-auto animate-slide-up">
                    <button 
                        onClick={() => {
                            const n = nodesRef.current.find(node => node.id === spotlightNode);
                            if (n) onSelectNote(n.data);
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-[var(--ui-primary)] text-white rounded-full font-bold shadow-xl shadow-blue-500/40 hover:scale-105 transition-transform active:scale-95"
                    >
                        <FileText size={18} /> Open Note
                    </button>
                </div>
            )}

            {/* Navigation Fab */}
            <div className="pointer-events-auto bg-[var(--ui-surface)]/90 backdrop-blur-md border border-[var(--ui-border)] rounded-full p-1.5 flex items-center gap-1 shadow-2xl">
                <button onClick={() => setTransform(t => ({...t, k: Math.min(t.k + 0.2, 3)}))} className="p-3 hover:bg-[var(--ui-bg)] rounded-full text-[var(--ui-text-main)] transition-colors"><ZoomIn size={20}/></button>
                <button onClick={() => { setTransform({ x: containerRef.current!.clientWidth/2, y: containerRef.current!.clientHeight/2, k: 0.8 }); setSpotlightNode(null); }} className="p-3 hover:bg-[var(--ui-bg)] rounded-full text-[var(--ui-text-main)] transition-colors"><RefreshCw size={20}/></button>
                <button onClick={() => setTransform(t => ({...t, k: Math.max(t.k - 0.2, 0.2)}))} className="p-3 hover:bg-[var(--ui-bg)] rounded-full text-[var(--ui-text-main)] transition-colors"><ZoomOut size={20}/></button>
            </div>
        </div>

        {/* 3. Context Menu (Desktop Right Click / Mobile Long Press) */}
        {contextMenu && (
            <div 
                className="fixed z-50 bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-xl shadow-2xl py-1 w-48 animate-fade-in backdrop-blur-xl"
                style={{ top: contextMenu.y, left: contextMenu.x }}
                onMouseLeave={() => setContextMenu(null)}
            >
                <div className="px-4 py-2 border-b border-[var(--ui-border)] bg-[var(--ui-bg)]/50 rounded-t-xl">
                    <span className="text-[10px] text-[var(--ui-text-muted)] font-bold uppercase tracking-wider block truncate">{contextMenu.node.label}</span>
                </div>
                <button onClick={() => { onSelectNote(contextMenu.node.data); setContextMenu(null); }} className="w-full text-left px-4 py-3 text-xs text-[var(--ui-text-main)] hover:bg-[var(--ui-bg)] flex items-center gap-3 transition-colors">
                    <FileText size={14} className="text-[var(--ui-primary)]"/> Open Note
                </button>
                <button onClick={() => { setSpotlightNode(contextMenu.node.id); setContextMenu(null); }} className="w-full text-left px-4 py-3 text-xs text-[var(--ui-text-main)] hover:bg-[var(--ui-bg)] flex items-center gap-3 transition-colors">
                    <Focus size={14} className="text-amber-500"/> Focus Neighborhood
                </button>
                <button onClick={() => { 
                    if(confirm("Delete node?")) storage.deleteNoteLocal(contextMenu.node.id); 
                    loadData(); 
                    setContextMenu(null); 
                }} className="w-full text-left px-4 py-3 text-xs text-red-500 hover:bg-red-50 flex items-center gap-3 transition-colors rounded-b-xl">
                    <Trash2 size={14}/> Delete
                </button>
            </div>
        )}

    </div>
  );
};

export default React.memo(GraphView);
