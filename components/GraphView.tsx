import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { HistoryItem, NoteMode, AIProvider } from '../types';
import { StorageService } from '../services/storageService';
import { ZoomIn, ZoomOut, RefreshCw, MousePointerClick, Maximize2, Move, Hand, Link2, PlusCircle, AlertCircle, Search, Filter, Layers, Zap, Navigation } from 'lucide-react';

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
  opacity?: number; // Visual state
}

interface Link {
  source: Node;
  target: Node;
  strength: number;
  opacity?: number; // Visual state
}

// Utility to generate a consistent color from a string (Tag)
const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
};

const GraphView: React.FC<GraphViewProps> = ({ onSelectNote }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // UX State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  
  // Interaction Modes
  const [isInteracting, setIsInteracting] = useState(false); // Enable Physics/Pan/Zoom
  const [isLinkMode, setIsLinkMode] = useState(false); // Enable Connecting Nodes
  
  // Simulation State
  const nodesRef = useRef<Node[]>([]);
  const linksRef = useRef<Link[]>([]);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 0.8 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [linkingSource, setLinkingSource] = useState<Node | null>(null); // For connecting
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); // Raw mouse pos for line drawing

  // Neighbor Cache (For Focus Mode)
  const neighborMap = useRef<Map<string, Set<string>>>(new Map());

  const animationRef = useRef<number>(0);
  const isSimulationRunning = useRef(true);

  const storage = useMemo(() => StorageService.getInstance(), []);

  // 1. LOAD DATA
  const loadData = useCallback(async () => {
    setLoading(true);
    const data = await storage.getUnifiedNotes();
    setNotes(data);
    
    // Auto-enable sandbox mode if empty, so user knows what to do
    if (data.length === 0) {
        setIsInteracting(true);
    }
    
    initSimulation(data);
    setLoading(false);
  }, [storage]);

  useEffect(() => {
    loadData();
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        setTransform(prev => ({ ...prev, x: containerRef.current!.clientWidth / 2, y: containerRef.current!.clientHeight / 2 }));
        isSimulationRunning.current = true;
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [loadData]);

  // 2. INIT SIMULATION
  const initSimulation = (items: HistoryItem[]) => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Create Nodes
    const newNodes: Node[] = items.map(item => {
      // Color Logic: Prioritize the FIRST tag as the "Category Cluster" color.
      let nodeColor = '#6366f1'; // Default Indigo
      
      if (item.tags && item.tags.length > 0) {
          nodeColor = stringToColor(item.tags[0]);
      } else {
          nodeColor = item.mode === NoteMode.CHEAT_CODES ? '#fbbf24' : 
                      item.mode === NoteMode.GENERAL ? '#22d3ee' : 
                      item.mode === NoteMode.CUSTOM ? '#10b981' :
                      '#6366f1';
      }

      return {
        id: item.id,
        x: (Math.random() - 0.5) * width * 0.5,
        y: (Math.random() - 0.5) * height * 0.5,
        vx: 0,
        vy: 0,
        radius: Math.max(8, Math.min(25, 10 + (item.tags?.length || 0) * 1.5)), 
        color: nodeColor, 
        label: item.topic,
        data: item,
        opacity: 1
      };
    });

    // Create Links & Neighbor Map
    const newLinks: Link[] = [];
    const nMap = new Map<string, Set<string>>();

    // Initialize neighbor sets
    newNodes.forEach(n => nMap.set(n.id, new Set()));

    for (let i = 0; i < newNodes.length; i++) {
      for (let j = i + 1; j < newNodes.length; j++) {
        const source = newNodes[i];
        const target = newNodes[j];
        
        const tagsA = source.data.tags || [];
        const tagsB = target.data.tags || [];
        
        // Calculate Intersection
        const shared = tagsA.filter(t => tagsB.includes(t));
        
        // Explicit Links (Topic match in tags)
        const explicitLinkA = tagsA.includes(target.data.topic.replace(/\s+/g, '-'));
        const explicitLinkB = tagsB.includes(source.data.topic.replace(/\s+/g, '-'));

        if (shared.length > 0 || explicitLinkA || explicitLinkB) {
          const strength = Math.min(0.9, (shared.length * 0.15) + (explicitLinkA ? 0.3 : 0) + 0.05);

          newLinks.push({
            source: source,
            target: target,
            strength: strength,
            opacity: 1
          });

          // Register Neighbors for Focus Mode
          nMap.get(source.id)?.add(target.id);
          nMap.get(target.id)?.add(source.id);
        }
      }
    }

    nodesRef.current = newNodes;
    linksRef.current = newLinks;
    neighborMap.current = nMap;

    setTransform({ x: width / 2, y: height / 2, k: 0.8 });
    isSimulationRunning.current = true;
  };

  // 3. SEARCH & FLY-TO LOGIC
  useEffect(() => {
     if (!searchQuery) {
        // Reset Visuals
        nodesRef.current.forEach(n => n.opacity = 1);
        linksRef.current.forEach(l => l.opacity = 1);
        return;
     }

     const lowerQ = searchQuery.toLowerCase();
     const matchedNode = nodesRef.current.find(n => n.label.toLowerCase().includes(lowerQ));

     // Visual Filtering
     nodesRef.current.forEach(n => {
         const match = n.label.toLowerCase().includes(lowerQ) || (n.data.tags?.some(t => t.toLowerCase().includes(lowerQ)));
         n.opacity = match ? 1 : 0.1;
     });
     linksRef.current.forEach(l => l.opacity = 0.05);

     // Camera Fly-To
     if (matchedNode) {
        // Smoothly animate transform to center on node
        // NOTE: In a real physics engine, we'd lerp. Here we snap for simplicity or can implement simple easing.
        setTransform({
            x: (containerRef.current?.clientWidth || 800) / 2 - matchedNode.x * 1.5,
            y: (containerRef.current?.clientHeight || 600) / 2 - matchedNode.y * 1.5,
            k: 1.5
        });
     }

  }, [searchQuery]);

  // 4. PHYSICS LOOP
  useEffect(() => {
    const tick = () => {
      if (!canvasRef.current) return;
      const nodes = nodesRef.current;
      const links = linksRef.current;
      const dt = 0.5;

      const REPULSION = 600; 
      const ATTRACTION = 0.012;
      const CENTER_GRAVITY = 0.003;
      const DAMPING = 0.85;

      let totalEnergy = 0;

      if (isSimulationRunning.current) {
        // Repulsion
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx*dx + dy*dy || 1; 
            const d = Math.sqrt(d2);
            
            if (d < 500) { 
              const f = REPULSION / d2;
              const fx = (dx / d) * f;
              const fy = (dy / d) * f;
              a.vx += fx; a.vy += fy;
              b.vx -= fx; b.vy -= fy;
            }
          }
        }

        // Attraction
        links.forEach(link => {
          const a = link.source;
          const b = link.target;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          // Hooke's Law variation
          const fx = dx * ATTRACTION * (1 + link.strength); 
          const fy = dy * ATTRACTION * (1 + link.strength);
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        });

        // Center Gravity & Update
        nodes.forEach(node => {
          // If searching, weak gravity to keep layout. If interacting, normal gravity.
          node.vx -= node.x * CENTER_GRAVITY;
          node.vy -= node.y * CENTER_GRAVITY;
          
          node.vx *= DAMPING;
          node.vy *= DAMPING;
          node.x += node.vx * dt;
          node.y += node.vy * dt;
          totalEnergy += Math.abs(node.vx) + Math.abs(node.vy);
        });

        if (totalEnergy < 0.2 && !isDragging) {
          isSimulationRunning.current = false;
        }
      }

      draw();
      animationRef.current = requestAnimationFrame(tick);
    };

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const { x: tx, y: ty, k: zoom } = transform;

      // 1. Clear & Background
      ctx.clearRect(0, 0, width, height);
      
      // Draw Grid (Subtle Cognitive Anchor)
      if (zoom > 0.5) {
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          const gridSize = 100 * zoom;
          const offsetX = tx % gridSize;
          const offsetY = ty % gridSize;
          
          for (let x = offsetX; x < width; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
          for (let y = offsetY; y < height; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
          ctx.stroke();
      }

      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(zoom, zoom);

      // 2. FOCUS MODE CALCULATION
      // If a node is hovered, dim everything else except neighbors
      const activeId = hoveredNode?.id;
      const neighbors = activeId ? neighborMap.current.get(activeId) : null;

      // Draw Links
      linksRef.current.forEach(link => {
        let alpha = 0.2; // Default subtle
        let width = 1 + (link.strength * 2);
        
        // Focus Mode Logic
        if (activeId) {
            const isConnected = (link.source.id === activeId || link.target.id === activeId);
            if (isConnected) {
                alpha = 0.8;
                width = 3; // Highlight connections
            } else {
                alpha = 0.05; // Dim others
            }
        } else if (searchQuery) {
            alpha = link.opacity || 0.1;
        }

        ctx.lineWidth = width;
        ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`; 
        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.stroke();
      });

      // Draw Active Linking Line (Rubber Band)
      if (isLinkMode && linkingSource) {
         const mx = (mousePos.x - tx) / zoom;
         const my = (mousePos.y - ty) / zoom;
         ctx.beginPath();
         ctx.moveTo(linkingSource.x, linkingSource.y);
         ctx.lineTo(mx, my);
         ctx.strokeStyle = '#22d3ee';
         ctx.lineWidth = 2;
         ctx.setLineDash([5, 5]);
         ctx.stroke();
         ctx.setLineDash([]);
      }

      // Draw Nodes
      nodesRef.current.forEach(node => {
        const isHovered = hoveredNode === node;
        const isNeighbor = activeId && neighbors?.has(node.id);
        const isSource = linkingSource === node;
        
        // Focus Opacity
        let opacity = 1;
        if (activeId && !isHovered && !isNeighbor) opacity = 0.2;
        if (searchQuery && node.opacity !== undefined) opacity = node.opacity;

        ctx.globalAlpha = opacity;

        // Node Body
        ctx.beginPath();
        const drawRadius = isHovered ? node.radius * 1.2 : node.radius; // Fitts' Law: bigger target when interacting
        ctx.arc(node.x, node.y, drawRadius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();
        
        // Glow / Stroke
        if (isHovered || isSource || isNeighbor) {
           ctx.shadowBlur = isHovered ? 30 : 15;
           ctx.shadowColor = node.color;
           ctx.strokeStyle = '#fff';
           ctx.lineWidth = isHovered ? 3 : 1;
           ctx.stroke();
           ctx.shadowBlur = 0;
        } else {
           ctx.strokeStyle = 'rgba(255,255,255,0.2)';
           ctx.lineWidth = 1;
           ctx.stroke();
        }

        // Labels (Detail Level based on Zoom)
        const showLabel = zoom > 0.6 || isHovered || isNeighbor || isSource || searchQuery;
        
        if (showLabel) {
          ctx.fillStyle = (isHovered || isSource) ? '#fff' : '#cbd5e1';
          ctx.font = (isHovered || isSource) ? 'bold 14px Inter' : '10px Inter';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Background pill for text readability in dense graphs
          const textWidth = ctx.measureText(node.label).width;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.beginPath();
          ctx.roundRect(node.x - textWidth/2 - 4, node.y + node.radius + 4, textWidth + 8, 16, 4);
          ctx.fill();

          ctx.fillStyle = (isHovered || isSource) ? '#22d3ee' : '#e2e8f0';
          ctx.fillText(node.label, node.x, node.y + node.radius + 12);
          
          // Tag Label (Subtitle)
          if ((isHovered) && node.data.tags && node.data.tags.length > 0) {
             ctx.fillStyle = node.color;
             ctx.font = 'italic 9px Inter';
             ctx.fillText(node.data.tags[0], node.x, node.y + node.radius + 24);
          }
        }
        
        ctx.globalAlpha = 1; // Reset
      });

      ctx.restore();
    };

    isSimulationRunning.current = true;
    tick();
    return () => cancelAnimationFrame(animationRef.current);
  }, [transform, hoveredNode, linkingSource, mousePos, isLinkMode, searchQuery]); 

  // 5. INTERACTION HANDLERS
  const getSimPos = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (clientX - rect.left - transform.x) / transform.k;
    const y = (clientY - rect.top - transform.y) / transform.k;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isInteracting && !isLinkMode) return;
    
    const { x, y } = getSimPos(e.clientX, e.clientY);
    const clickedNode = nodesRef.current.find(n => {
       const dx = n.x - x;
       const dy = n.y - y;
       return Math.sqrt(dx*dx + dy*dy) < n.radius + 5; 
    });

    if (isLinkMode) {
       if (clickedNode) {
         if (!linkingSource) {
           setLinkingSource(clickedNode);
         } else if (linkingSource.id !== clickedNode.id) {
              storage.connectNotes(linkingSource.id, clickedNode.id);
              loadData();
              setLinkingSource(null);
              setIsLinkMode(false);
         }
       } else setLinkingSource(null);
       return;
    }

    if (clickedNode) {
       // Single click can just select, double click opens. 
       // For now, let's make single click select to not disrupt physics dragging
       onSelectNote(clickedNode.data);
    } else {
       setIsDragging(true);
       setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isLinkMode) setMousePos({ x: e.clientX, y: e.clientY });
    if (!isInteracting && !isLinkMode) return;

    const { x, y } = getSimPos(e.clientX, e.clientY);

    if (isDragging && !isLinkMode) {
       setTransform(prev => ({
          ...prev,
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
       }));
    } else {
       const hover = nodesRef.current.find(n => {
         const dx = n.x - x;
         const dy = n.y - y;
         return Math.sqrt(dx*dx + dy*dy) < n.radius + 5;
       });
       setHoveredNode(hover || null);
       if (canvasRef.current) canvasRef.current.style.cursor = isLinkMode ? 'crosshair' : (hover ? 'pointer' : 'move');
    }
  };

  const handleDoubleClick = () => {
      // Create new note
      const id = Date.now().toString();
      const newNote: HistoryItem = {
          id, timestamp: Date.now(), topic: 'New Idea',
          content: '# New Idea\nStart typing...', mode: NoteMode.CUSTOM,
          provider: AIProvider.GEMINI, parentId: null, tags: ['New']
      };
      storage.saveNoteLocal(newNote);
      loadData();
      onSelectNote(newNote);
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = useCallback((e: React.WheelEvent) => {
     if (!isInteracting) return;
     const zoomSensitivity = 0.001;
     const newK = Math.max(0.2, Math.min(3, transform.k - e.deltaY * zoomSensitivity));
     setTransform(prev => ({ ...prev, k: newK }));
  }, [isInteracting, transform.k]);

  // Helper to get all tags
  const allTags = useMemo(() => Array.from(new Set(notes.flatMap(n => n.tags || []))).slice(0, 10), [notes]);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[#050911] overflow-hidden">
      <canvas 
        ref={canvasRef}
        className={`absolute inset-0 block ${isInteracting || isLinkMode ? 'cursor-move' : 'pointer-events-none'}`} 
        width={800} 
        height={600}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />

      {/* --- HUD: HEADER --- */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-auto">
        <div className="flex items-center gap-3 backdrop-blur-md bg-black/40 p-2 rounded-xl border border-white/10 shadow-xl">
           <div className="p-2 bg-neuro-primary/20 rounded-lg text-neuro-primary">
              <Maximize2 size={20} />
           </div>
           <div>
             <h2 className="text-sm font-bold text-white">Synapse Graph</h2>
             <p className="text-[10px] text-gray-400 font-mono">{notes.length} Nodes • {linksRef.current.length} Links</p>
           </div>
        </div>

        {/* SEARCH & FILTER BAR */}
        <div className="flex items-center gap-2 backdrop-blur-md bg-black/40 p-1.5 rounded-xl border border-white/10 w-64 animate-fade-in transition-all focus-within:w-80 focus-within:border-neuro-primary/50">
           <Search size={14} className="text-gray-500 ml-2"/>
           <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Fly to node..." 
              className="bg-transparent border-none outline-none text-xs text-white placeholder-gray-600 w-full"
           />
           {searchQuery && <button onClick={() => setSearchQuery('')} className="text-gray-500 hover:text-white"><AlertCircle size={12}/></button>}
        </div>
      </div>

      {/* --- HUD: TAG CLOUD --- */}
      {isInteracting && allTags.length > 0 && (
         <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-1 pointer-events-none">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 bg-black/50 px-2 rounded">Quick Filters</span>
            <div className="flex flex-col items-end gap-1 pointer-events-auto">
               {allTags.map(tag => (
                   <button 
                      key={tag}
                      onClick={() => setSearchQuery(tag)} // Simple filter by setting search
                      className="text-[10px] bg-gray-900/60 hover:bg-neuro-primary/20 border border-gray-700 hover:border-neuro-primary text-gray-400 hover:text-white px-2 py-0.5 rounded-full transition-all backdrop-blur-sm"
                   >
                      #{tag}
                   </button>
               ))}
            </div>
         </div>
      )}

      {/* --- HUD: CONTROLS --- */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-20">
         {/* Interaction Toggles */}
         <div className="flex flex-col gap-2 bg-gray-900/80 p-1.5 rounded-xl border border-gray-700 backdrop-blur-md">
             <button
                onClick={() => { setIsLinkMode(!isLinkMode); setLinkingSource(null); }}
                className={`p-2 rounded-lg transition-all ${isLinkMode ? 'bg-cyan-600 text-white shadow-lg animate-pulse' : 'text-gray-400 hover:text-cyan-400 hover:bg-gray-800'}`}
                title="Link Mode"
            >
                <Link2 size={18} />
            </button>
             <button 
                onClick={() => { setIsInteracting(!isInteracting); setIsLinkMode(false); }}
                className={`p-2 rounded-lg transition-all ${isInteracting ? 'bg-neuro-primary text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                title="Pan/Zoom Mode"
            >
                {isInteracting ? <Move size={18} /> : <Hand size={18} />}
            </button>
         </div>

         {/* Zoom Controls */}
         {isInteracting && (
           <div className="flex flex-col gap-1 bg-gray-900/80 p-1.5 rounded-xl border border-gray-700 backdrop-blur-md animate-slide-up">
             <button onClick={() => setTransform(prev => ({ ...prev, k: Math.min(prev.k + 0.3, 3) }))} className="p-2 hover:bg-gray-700 rounded text-gray-300"><ZoomIn size={16}/></button>
             <button onClick={() => { 
                 isSimulationRunning.current = true; 
                 loadData(); 
                 setTransform({ x: containerRef.current!.clientWidth/2, y: containerRef.current!.clientHeight/2, k: 0.8 });
             }} className="p-2 hover:bg-gray-700 rounded text-gray-300"><Navigation size={16}/></button>
             <button onClick={() => setTransform(prev => ({ ...prev, k: Math.max(prev.k - 0.3, 0.2) }))} className="p-2 hover:bg-gray-700 rounded text-gray-300"><ZoomOut size={16}/></button>
           </div>
         )}
      </div>

      {!isInteracting && notes.length > 0 && (
         <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <div className="bg-black/40 backdrop-blur-md px-6 py-3 rounded-full border border-neuro-primary/30 text-xs text-neuro-primary font-mono flex items-center gap-2 shadow-[0_0_30px_rgba(99,102,241,0.2)] animate-pulse">
               <MousePointerClick size={14} /> 
               <span>ACTIVATE NAVIGATION PROTOCOL</span>
            </div>
         </div>
      )}

      {notes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center opacity-50 bg-black/50 p-6 rounded-2xl border border-dashed border-gray-600 backdrop-blur-sm">
               <PlusCircle size={48} className="mx-auto mb-2 text-neuro-primary"/>
               <p className="text-white font-bold">Neural Net Empty</p>
               <p className="text-xs text-gray-400 mt-1">Double-click to spawn a thought node.</p>
            </div>
         </div>
      )}
      
      {/* Helper Toast */}
      {isLinkMode && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-cyan-900/90 text-cyan-100 px-6 py-2 rounded-full text-xs font-bold border border-cyan-500/50 shadow-2xl pointer-events-none animate-slide-up flex items-center gap-2">
              <Link2 size={12} className="animate-spin-slow"/>
              {linkingSource ? "SELECT TARGET TO CONNECT" : "SELECT SOURCE NODE"}
          </div>
      )}
    </div>
  );
};

export default React.memo(GraphView);