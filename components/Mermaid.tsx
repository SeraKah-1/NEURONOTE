
import React, { useEffect, useRef, useState, memo } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, AlertTriangle, RefreshCw } from 'lucide-react';

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
        const mermaid = (await import('mermaid')).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: 'base', // 'base' allows better CSS override than 'default' or 'dark'
          securityLevel: 'loose',
          fontFamily: 'Inter',
          themeVariables: {
            primaryColor: '#ffffff',
            primaryBorderColor: '#000000',
            primaryTextColor: '#000000',
            lineColor: '#000000',
            secondaryColor: '#f4f4f5',
            tertiaryColor: '#fff',
            mainBkg: '#ffffff',
            nodeBorder: '#000000',
          },
          // CRITICAL: Disable max width to prevent shrinking
          flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis' },
          mindmap: { useMaxWidth: false },
          sequence: { useMaxWidth: false },
          gantt: { useMaxWidth: false },
          journey: { useMaxWidth: false },
          timeline: { useMaxWidth: false },
          class: { useMaxWidth: false },
          state: { useMaxWidth: false },
          er: { useMaxWidth: false },
        });

        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const cleanChart = chart.replace(/```mermaid/g, '').replace(/```/g, '').trim();
        
        // Render
        const { svg } = await mermaid.render(id, cleanChart);
        
        if (isMounted) {
          // CRITICAL FIX FOR VISIBILITY:
          // Remove width/height attributes that constrain SVG to container width
          // causing it to shrink and become unreadable on complex diagrams.
          let fixedSvg = svg
             .replace(/width="[\d\.]+(px|%)?"/gi, '')
             .replace(/height="[\d\.]+(px|%)?"/gi, '')
             .replace(/style="[^"]*"/gi, '') // Remove inline max-width/height styles completely
             .replace('<svg', '<svg style="max-width: none !important; min-width: 100%; height: auto;"');
          
          setSvg(fixedSvg);
          setError(false);
          setLoading(false);
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
    setScale(prev => Math.min(prev + 0.2, 5)); // Increased max zoom
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(prev => Math.max(prev - 0.2, 0.3));
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
     setPanning(true);
     setStartPos({ x: e.clientX - position.x, y: e.clientY - position.y });
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
      <div className="my-6 rounded-lg border-2 border-red-500 bg-red-50 p-4">
          {!showErrorDetail ? (
             <div 
                onClick={() => setShowErrorDetail(true)}
                className="flex items-center justify-between cursor-pointer group"
             >
                <div className="flex items-center gap-3">
                   <AlertTriangle className="text-red-500" size={20} />
                   <span className="text-sm font-bold text-red-700">DIAGRAM ERROR</span>
                </div>
                <button className="text-[10px] font-bold bg-red-200 text-red-700 px-2 py-1 rounded hover:bg-red-300">DETAILS</button>
             </div>
          ) : (
             <div>
                 <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-red-700">SYNTAX ERROR</h4>
                    <button onClick={() => setShowErrorDetail(false)} className="text-[10px] text-red-500 hover:text-red-700">CLOSE</button>
                 </div>
                 <pre className="text-[10px] font-mono text-red-800 bg-red-100 p-2 rounded whitespace-pre-wrap border border-red-200">
                    {chart.replace(/```mermaid/g, '').replace(/```/g, '').trim()}
                 </pre>
             </div>
          )}
      </div>
    );
  }

  return (
    <div className="mermaid-container group">
      
      {/* Controls Overlay */}
      <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
         <div className="bg-black/90 rounded-lg p-1 flex gap-1 shadow-xl border border-white/20">
            <button onClick={handleZoomIn} className="p-1.5 text-white hover:bg-white/20 rounded" title="Zoom In"><ZoomIn size={14} /></button>
            <button onClick={handleReset} className="p-1.5 text-white hover:bg-white/20 rounded" title="Reset"><RotateCcw size={14} /></button>
            <button onClick={handleZoomOut} className="p-1.5 text-white hover:bg-white/20 rounded" title="Zoom Out"><ZoomOut size={14} /></button>
         </div>
      </div>

      <div 
        className={`relative ${panning ? 'cursor-grabbing' : 'cursor-grab'} bg-[var(--md-bg)] rounded-lg overflow-auto custom-scrollbar border border-[var(--md-border)]`}
        style={{ minHeight: '350px', maxHeight: '70vh' }} 
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {loading ? (
           <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
               <RefreshCw size={24} className="animate-spin mb-2 text-[var(--ui-text-main)]"/>
               <span className="text-xs font-bold text-[var(--ui-text-main)] tracking-widest">RENDERING...</span>
           </div>
        ) : (
           <div 
             className="w-fit h-full flex items-start justify-center p-4 origin-top-left mx-auto"
             style={{ 
                transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                transition: panning ? 'none' : 'transform 0.1s ease-out',
                minWidth: '100%'
             }}
             dangerouslySetInnerHTML={{ __html: svg }}
           />
        )}
      </div>
    </div>
  );
});

export default Mermaid;
