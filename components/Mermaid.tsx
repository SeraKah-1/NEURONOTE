
import React, { useEffect, useRef, useState, memo } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface MermaidProps {
  chart: string;
}

const Mermaid: React.FC<MermaidProps> = memo(({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  
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

  if (error) {
    return (
      <div className="p-4 border border-red-900 bg-red-900/20 rounded text-red-200 text-sm font-mono">
        <p className="mb-2 font-bold">Failed to render diagram</p>
        <pre className="whitespace-pre-wrap text-xs opacity-70">{chart}</pre>
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
           <div className="text-xs text-gray-500 font-mono animate-pulse">Rendering Diagram...</div>
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
