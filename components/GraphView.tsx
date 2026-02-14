
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { HistoryItem, NoteMode } from '../types';
import { StorageService } from '../services/storageService';
import { ZoomIn, ZoomOut, RefreshCw, Maximize2, Search, Filter, Trash2, FileText, X, Share2, Focus, GripHorizontal, BrainCircuit } from 'lucide-react';

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
  const [hasData, setHasData] = useState(false); // Empty state tracker

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
        
        // Center initial view if transform hasn't been set
        if (transform.x === 0 && transform.y === 0) {
            setTransform(prev => ({ ...prev, x: rect.width / 2, y: rect.height / 2 }));
        }
      }
    };
    window.addEventListener('resize', handleResize);
    // Delay initial resize slightly to allow container layout to settle
    setTimeout(handleResize, 100); 
    
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [loadData]);

  const initSimulation = (items: HistoryItem[]) => {
    // Note: We don't return early even if empty, so the canvas loop still runs (drawing grid)
    if (items.length === 0) {
        setHasData(false);
        nodesRef.current = [];
        linksRef.current = [];
        return;
    }
    setHasData(true);

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

    // Helper to get CSS Variable from the container (where the theme class lives), NOT body
    const getVar = (name: string, fallback: string) => {
        if (!containerRef.current) return fallback;
        const val = getComputedStyle(containerRef.current).getPropertyValue(name).trim();
        return val || fallback;
    };

    const tick = () => {
      if (!isRunning || !canvasRef.current) return;
      
      // Update Physics
      const nodes = nodesRef.current;
      const links = linksRef.current;
      
      const REPULSION = 1000;
      const SPRING_LEN = 150;
      const CENTER_GRAVITY = 0.001; // Weaker gravity for more spread
      const DT = 0.6;

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
        const f = (dist - SPRING_LEN) * 0.02;
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

      // Dynamic Theme Colors
      const bg = getVar('--ui-bg', '#ffffff');
      const textMain = getVar('--ui-text-main', '#0f172a');
      const border = getVar('--ui-border', '#e2e8f0');

      // Clear
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      
      // Draw Background Grid (To prove canvas is alive)
      ctx.strokeStyle = border;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.3;
      const gridSize = 50 * transform.k;
      const offsetX = transform.x % gridSize;
      const offsetY = transform.y % gridSize;
      
      ctx.beginPath();
      for (let x = offsetX; x < width; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
      for (let y = offsetY; y < height; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Transform Camera
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      // Links
      links.forEach(l => {
        if (!l.sourceNode || !l.targetNode) return;
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
        const isMatch = !searchQuery || n.label.toLowerCase().includes(searchQuery.toLowerCase());
        const isSpotlight = n.id === spotlightNode;
        const isNeighbor = spotlightNode && links.some(l => (l.source === spotlightNode && l.target === n.id) || (l.target === spotlightNode && l.source === n.id));
        
        let alpha = 1;
        if (searchQuery && !isMatch) alpha = 0.1;
        if (spotlightNode && !isSpotlight && !isNeighbor) alpha = 0.1;

        ctx.globalAlpha = alpha;

        // Glow
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

        // Label (LOD)
        if (transform.k > 0.6 || isSpotlight || isNeighbor || (searchQuery && isMatch)) {
            ctx.shadowBlur = 0;
            ctx.font = `bold 12px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
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
    
    const x = (cx - rect.left - transform.x) / transform.k;
    const y = (cy - rect.top - transform.y) / transform.k;
    return { x, y, cx, cy };
  };

  const getNodeAt = (x: number, y: number) => {
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const dist = Math.sqrt((n.x - x)**2 + (n.y - y)**2);
      if (dist < n.radius + 10) return n;
    }
    return null;
  };

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (contextMenu) setContextMenu(null);

    if ('touches' in e && e.touches.length === 2) {
       const dx = e.touches[0].clientX - e.touches[1].clientX;
       const dy = e.touches[0].clientY - e.touches[1].clientY;
       lastTouchDistance.current = Math.sqrt(dx*dx + dy*dy);
       return; 
    }

    const { x, y, cx, cy } = getPos(e);
    const node = getNodeAt(x, y);

    if (node) {
       isDragging.current = true;
       dragNode.current = node;
       dragStartPos.current = { x: cx, y: cy };
       setSpotlightNode(node.id);
    } else {
       isDragging.current = true;
       dragNode.current = null;
       dragStartPos.current = { x: cx, y: cy };
       if (spotlightNode) setSpotlightNode(null);
    }
  };

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e && e.touches.length === 2 && lastTouchDistance.current) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const delta = dist - lastTouchDistance.current;
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

    if (dragNode.current) {
       dragNode.current.x = x;
       dragNode.current.y = y;
       dragNode.current.vx = 0; 
       dragNode.current.vy = 0;
    } else {
       setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
       dragStartPos.current = { x: cx, y: cy };
    }
  };

  const handleEnd = (e: React.TouchEvent | React.MouseEvent) => {
    lastTouchDistance.current = null;
    isDragging.current = false;
    dragNode.current = null;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      const { x, y } = getPos(e);
      const node = getNodeAt(x, y);
      if (node) {
          setContextMenu({ x: e.clientX, y: e.clientY, node });
      }
  };

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[var(--ui-bg)] overflow-hidden touch-none select-none">
        
        {/* Placeholder - Only shows if truly no data, but canvas grid will still render behind it */}
        {!hasData && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none p-6">
                <div className="bg-[var(--ui-surface)]/80 backdrop-blur-md p-8 rounded-2xl border border-[var(--ui-border)] shadow-2xl text-center max-w-sm">
                    <div className="w-16 h-16 bg-[var(--ui-bg)] rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner border border-[var(--ui-border)]">
                        <BrainCircuit size={32} className="text-[var(--ui-text-muted)]" />
                    </div>
                    <h3 className="text-lg font-bold text-[var(--ui-text-main)] mb-2">Neural Network Offline</h3>
                    <p className="text-xs text-[var(--ui-text-muted)] leading-relaxed">
                        The synapse graph is currently empty. Create notes in the Workspace to visualize connections.
                    </p>
                </div>
            </div>
        )}

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

        {/* HUD Controls */}
        <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start pointer-events-none">
            <div className="flex flex-col gap-2 pointer-events-auto w-full max-w-xs">
                <div className="bg-[var(--ui-surface)]/80 backdrop-blur-md border border-[var(--ui-border)] p-3 rounded-2xl shadow-xl flex items-center gap-3">
                    <div className="p-2 bg-[var(--ui-primary)] text-white rounded-xl shadow-lg shadow-blue-500/30">
                        <Maximize2 size={18} />
                    </div>
                    <div>
                        <h2 className="text-xs font-bold text-[var(--ui-text-main)] uppercase tracking-wider">Synapse Graph</h2>
                        <p className="text-[10px] text-[var(--ui-text-muted)]">{nodesRef.current.length} Nodes Active</p>
                    </div>
                </div>
            </div>
        </div>

        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4 z-20 pointer-events-none px-6">
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

            <div className="pointer-events-auto bg-[var(--ui-surface)]/90 backdrop-blur-md border border-[var(--ui-border)] rounded-full p-1.5 flex items-center gap-1 shadow-2xl">
                <button onClick={() => setTransform(t => ({...t, k: Math.min(t.k + 0.2, 3)}))} className="p-3 hover:bg-[var(--ui-bg)] rounded-full text-[var(--ui-text-main)] transition-colors"><ZoomIn size={20}/></button>
                <button onClick={() => { setTransform({ x: containerRef.current!.clientWidth/2, y: containerRef.current!.clientHeight/2, k: 0.8 }); setSpotlightNode(null); }} className="p-3 hover:bg-[var(--ui-bg)] rounded-full text-[var(--ui-text-main)] transition-colors"><RefreshCw size={20}/></button>
                <button onClick={() => setTransform(t => ({...t, k: Math.max(t.k - 0.2, 0.2)}))} className="p-3 hover:bg-[var(--ui-bg)] rounded-full text-[var(--ui-text-main)] transition-colors"><ZoomOut size={20}/></button>
            </div>
        </div>

        {/* Context Menu */}
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
