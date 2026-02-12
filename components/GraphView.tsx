
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { HistoryItem, NoteMode, AIProvider } from '../types';
import { StorageService } from '../services/storageService';
import { ZoomIn, ZoomOut, RefreshCw, MousePointerClick, Maximize2, Move, Hand, Link2, PlusCircle, AlertCircle } from 'lucide-react';

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
  source: Node;
  target: Node;
  strength: number;
}

const GraphView: React.FC<GraphViewProps> = ({ onSelectNote }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  
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
    const newNodes: Node[] = items.map(item => ({
      id: item.id,
      x: Math.random() * width - width/2,
      y: Math.random() * height - height/2,
      vx: 0,
      vy: 0,
      radius: Math.max(8, Math.min(20, 10 + (item.tags?.length || 0) * 1.5)), 
      color: item.mode === 'cheat_codes' ? '#fbbf24' : 
             item.mode === 'principles' ? '#22d3ee' : 
             '#6366f1', 
      label: item.topic,
      data: item
    }));

    // Create Links based on Shared Tags
    const newLinks: Link[] = [];
    for (let i = 0; i < newNodes.length; i++) {
      for (let j = i + 1; j < newNodes.length; j++) {
        const source = newNodes[i];
        const target = newNodes[j];
        
        // Advanced Match: Tag overlap OR simple content string match (topic A inside tags B)
        const tagsA = source.data.tags || [];
        const tagsB = target.data.tags || [];
        const shared = tagsA.filter(t => tagsB.includes(t));
        
        // Also check if they explicitly reference each other via "tag link" logic from StorageService
        const explicitLinkA = tagsA.includes(target.data.topic.replace(/\s+/g, '-'));
        const explicitLinkB = tagsB.includes(source.data.topic.replace(/\s+/g, '-'));

        if (shared.length > 0 || explicitLinkA || explicitLinkB) {
          newLinks.push({
            source: source,
            target: target,
            strength: Math.min(0.8, (shared.length || 1) * 0.1)
          });
        }
      }
    }

    nodesRef.current = newNodes;
    linksRef.current = newLinks;
    setTransform({ x: width / 2, y: height / 2, k: 0.8 });
    isSimulationRunning.current = true;
  };

  // 3. PHYSICS LOOP
  useEffect(() => {
    const tick = () => {
      if (!canvasRef.current) return;
      const nodes = nodesRef.current;
      const links = linksRef.current;
      const dt = 0.5;

      const REPULSION = 400; // Increased repulsion for cleaner layout
      const ATTRACTION = 0.015;
      const CENTER_GRAVITY = 0.002;
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
            
            if (d < 400) { 
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
          const fx = dx * ATTRACTION * (1 + link.strength);
          const fy = dy * ATTRACTION * (1 + link.strength);
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        });

        // Center Gravity & Update
        nodes.forEach(node => {
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

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(zoom, zoom);

      // Draw Links
      ctx.lineWidth = 1.5;
      linksRef.current.forEach(link => {
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)'; 
        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.stroke();
      });

      // Draw Active Linking Line (Rubber Band)
      if (isLinkMode && linkingSource) {
         // Need to untransform mouse pos
         const mx = (mousePos.x - tx) / zoom;
         const my = (mousePos.y - ty) / zoom;
         
         ctx.beginPath();
         ctx.moveTo(linkingSource.x, linkingSource.y);
         ctx.lineTo(mx, my);
         ctx.strokeStyle = '#22d3ee'; // Cyan
         ctx.lineWidth = 2;
         ctx.setLineDash([5, 5]);
         ctx.stroke();
         ctx.setLineDash([]);
      }

      // Draw Nodes
      nodesRef.current.forEach(node => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();
        
        // Highlight logic
        const isHovered = hoveredNode === node;
        const isSource = linkingSource === node;
        
        if (isHovered || isSource) {
           ctx.shadowBlur = 20;
           ctx.shadowColor = isSource ? '#22d3ee' : node.color;
           ctx.strokeStyle = '#fff';
           ctx.lineWidth = isSource ? 3 : 2;
           ctx.stroke();
           ctx.shadowBlur = 0;
        } else {
           ctx.strokeStyle = 'rgba(255,255,255,0.1)';
           ctx.lineWidth = 1;
           ctx.stroke();
        }

        // Labels
        if (zoom > 1.0 || isHovered || isSource) {
          ctx.fillStyle = isSource ? '#22d3ee' : '#e2e8f0';
          ctx.font = isSource ? 'bold 12px Inter' : '10px Inter';
          ctx.textAlign = 'center';
          ctx.fillText(node.label, node.x, node.y + node.radius + 14);
        }
      });

      ctx.restore();
    };

    isSimulationRunning.current = true;
    tick();
    return () => cancelAnimationFrame(animationRef.current);
  }, [transform, hoveredNode, linkingSource, mousePos, isLinkMode]); 

  // 4. INTERACTION HANDLERS
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

    // MODE: LINKING
    if (isLinkMode) {
       if (clickedNode) {
         if (!linkingSource) {
           setLinkingSource(clickedNode);
         } else {
           if (linkingSource.id !== clickedNode.id) {
              // CONNECT!
              storage.connectNotes(linkingSource.id, clickedNode.id);
              loadData(); // Reload to see physics update
              setLinkingSource(null);
              setIsLinkMode(false); // Auto exit link mode
           }
         }
       } else {
         // Clicked empty space -> Cancel Link
         setLinkingSource(null);
       }
       return;
    }

    // MODE: STANDARD
    if (clickedNode) {
       onSelectNote(clickedNode.data);
    } else {
       setIsDragging(true);
       setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Always track mouse for rubber band
    if (isLinkMode) {
        setMousePos({ x: e.clientX, y: e.clientY });
    }

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
       if (canvasRef.current) {
          canvasRef.current.style.cursor = isLinkMode ? 'crosshair' : (hover ? 'pointer' : 'move');
       }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
      // SANDBOX MODE: Create new empty note on double click
      // We'll create a dummy note and open it.
      const id = Date.now().toString();
      const newNote: HistoryItem = {
          id,
          timestamp: Date.now(),
          topic: 'New Idea',
          content: '# New Idea\nStart typing here... add hashtags like #brain to connect.',
          mode: NoteMode.CUSTOM,
          provider: AIProvider.GEMINI,
          parentId: null,
          tags: ['New']
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

      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h2 className="text-xl font-bold text-white flex items-center gap-2 drop-shadow-md">
           <Maximize2 className="text-neuro-primary" /> Synapse View
        </h2>
        <p className="text-xs text-gray-400 font-mono">
           {notes.length} NODES // {(linksRef.current.length)} CONNECTIONS
        </p>
      </div>

      {/* Controls */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-10">
         
         {/* Link Mode Toggle */}
         {isInteracting && (
            <button
                onClick={() => { setIsLinkMode(!isLinkMode); setLinkingSource(null); }}
                className={`p-2 border rounded transition-all shadow-lg ${isLinkMode ? 'bg-cyan-600 border-cyan-500 text-white animate-pulse' : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-cyan-400'}`}
                title="Connect Nodes (Click Source -> Click Target)"
            >
                <Link2 size={18} />
            </button>
         )}

         {/* Interaction Toggle */}
         <button 
           onClick={() => { setIsInteracting(!isInteracting); setIsLinkMode(false); }}
           className={`p-2 border rounded transition-all shadow-lg ${isInteracting ? 'bg-neuro-primary border-neuro-primary text-white' : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-white'}`}
           title={isInteracting ? "Disable Interaction" : "Enable Sandbox Mode"}
         >
            {isInteracting ? <Move size={18} /> : <Hand size={18} />}
         </button>

         {isInteracting && (
           <div className="flex flex-col gap-2 animate-fade-in mt-2">
             <button onClick={() => setTransform(prev => ({ ...prev, k: prev.k + 0.2 }))} className="p-2 bg-gray-900/80 border border-gray-700 text-white rounded hover:bg-gray-800"><ZoomIn size={18}/></button>
             <button onClick={() => { 
                 isSimulationRunning.current = true; 
                 loadData(); 
             }} className="p-2 bg-gray-900/80 border border-gray-700 text-white rounded hover:bg-gray-800"><RefreshCw size={18}/></button>
             <button onClick={() => setTransform(prev => ({ ...prev, k: prev.k - 0.2 }))} className="p-2 bg-gray-900/80 border border-gray-700 text-white rounded hover:bg-gray-800"><ZoomOut size={18}/></button>
           </div>
         )}
      </div>

      {!isInteracting && notes.length > 0 && (
         <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <div className="bg-black/40 backdrop-blur-[2px] px-6 py-3 rounded-full border border-white/10 text-xs text-gray-300 font-mono flex items-center gap-2">
               <AlertCircle size={14} className="text-neuro-primary"/> 
               <span>CLICK HAND ICON TO INTERACT</span>
            </div>
         </div>
      )}

      {/* Empty State Sandbox Prompt */}
      {notes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center opacity-50 bg-black/50 p-4 rounded-xl border border-dashed border-gray-600">
               <PlusCircle size={48} className="mx-auto mb-2 text-neuro-primary"/>
               <p className="text-white font-bold">Sandbox Empty</p>
               <p className="text-xs text-gray-400">Double-click anywhere to create a new thought node.</p>
            </div>
         </div>
      )}
      
      {/* Linking Helper Text */}
      {isLinkMode && (
          <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-cyan-900/80 text-cyan-100 px-4 py-2 rounded-full text-xs font-bold border border-cyan-500/50 shadow-lg pointer-events-none animate-slide-up">
              {linkingSource ? "SELECT TARGET NODE TO CONNECT" : "SELECT SOURCE NODE"}
          </div>
      )}
    </div>
  );
};

export default React.memo(GraphView);
