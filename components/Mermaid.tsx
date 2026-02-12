
import React, { useEffect, useRef, useState, memo } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, AlertTriangle, Eye, RefreshCw } from 'lucide-react';

interface MermaidProps {
  chart: string;
}

const Mermaid: React.FC<MermaidProps> = memo(({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  
  // Zoom & Pan State
  const [scale, setScale] = useState(1);
  const [panning, setPanning] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let isMounted = true;

    const initAndRender = async () => {
      if (!containerRef.current) return;
      
      try {
        setLoading(true);
        // DYNAMIC IMPORT: Only load the heavy mermaid library when this component mounts
        const mermaid = (await import('mermaid')).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: 'Inter',
        });

        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const cleanChart = chart.replace(/```mermaid/g, '').replace(/```/g, '').trim();
        
        const { svg } = await mermaid.render(id, cleanChart);
        
        if (isMounted) {
          setSvg(svg);
          setError(false);
          setLoading(false);
          // Reset zoom on new chart render
          setScale(1);
          setPosition({ x: 0, y: 0 });
        }
      } catch (err) {
        console.error('Mermaid render error:', err);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    initAndRender();

    return () => { isMounted = false; };
  }, [chart]);

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(prev => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Simple drag logic (for desktop primarily)
  const handleMouseDown = (e: React.MouseEvent) => {
     if (scale > 1) {
       setPanning(true);
       setStartPos({ x: e.clientX - position.x, y: e.clientY - position.y });
     }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!panning) return;
    e.preventDefault();
    setPosition({
      x: e.clientX - startPos.x,
      y: e.clientY - startPos.y
    });
  };

  const handleMouseUp = () => setPanning(false);

  // --- MINIMAL ERROR STATE ---
  if (error) {
    return (
      <div className="my-6 rounded-lg border border-red-900/30 bg-red-950/10 overflow-hidden transition-all duration-300">
          {!showErrorDetail ? (
             <div 
                onClick={() => setShowErrorDetail(true)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-red-950/20 group"
             >
                <div className="flex items-center gap-3">
                   <AlertTriangle className="text-red-500/70 group-hover:text-red-500 transition-colors" size={18} />
                   <span className="text-xs font-mono text-red-400/80 group-hover:text-red-300">DIAGRAM RENDERING BLOCKED</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-red-500/50 uppercase font-bold tracking-widest group-hover:text-red-400">
                    <Eye size={12} /> View Logs
                </div>
             </div>
          ) : (
             <div className="p-4">
                 <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-red-400 flex items-center gap-2">
                        <AlertTriangle size={14}/> Syntax Error Detected
                    </h4>
                    <button onClick={() => setShowErrorDetail(false)} className="text-[10px] text-red-500 hover:text-red-300">HIDE</button>
                 </div>
                 <div className="bg-black/40 p-3 rounded border border-red-900/30 overflow-x-auto">
                    <pre className="text-[10px] font-mono text-red-300/70 whitespace-pre leading-relaxed">
                        {chart.replace(/```mermaid/g, '').replace(/```/g, '').trim()}
                    </pre>
                 </div>
                 <p className="text-[10px] text-gray-500 mt-2 italic">The AI generated invalid graph syntax. Please regenerate or edit the code block manually.</p>
             </div>
          )}
      </div>
    );
  }

  return (
    <div className="relative group my-6 border border-gray-800 rounded-lg bg-[#0a0f18] overflow-hidden hover:border-gray-600 transition-colors">
      
      {/* Controls Overlay */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900/80 rounded-lg p-1 backdrop-blur-sm border border-gray-700">
         <button onClick={handleZoomIn} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded" title="Zoom In">
            <ZoomIn size={14} />
         </button>
         <button onClick={handleReset} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded" title="Reset View">
            <RotateCcw size={14} />
         </button>
         <button onClick={handleZoomOut} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded" title="Zoom Out">
            <ZoomOut size={14} />
         </button>
      </div>

      <div 
        className={`mermaid-container p-4 overflow-hidden cursor-${panning ? 'grabbing' : scale > 1 ? 'grab' : 'default'} flex justify-center items-center min-h-[150px] transition-opacity duration-300 ${loading ? 'opacity-50' : 'opacity-100'}`}
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {loading ? (
           <div className="flex flex-col items-center justify-center py-6 text-gray-600 space-y-2">
               <RefreshCw size={16} className="animate-spin text-neuro-primary/50"/>
               <span className="text-[10px] font-mono tracking-widest">RENDERING...</span>
           </div>
        ) : (
           <div 
             style={{ 
                transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                transition: panning ? 'none' : 'transform 0.2s ease-out',
                transformOrigin: 'center center'
             }}
             dangerouslySetInnerHTML={{ __html: svg }}
           />
        )}
      </div>
      
      <div className="absolute bottom-2 right-2 text-[9px] text-gray-600 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
         {Math.round(scale * 100)}%
      </div>
    </div>
  );
});

export default Mermaid;
