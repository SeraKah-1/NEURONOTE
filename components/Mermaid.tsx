
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  ZoomIn, ZoomOut, RotateCcw, 
  Maximize, Minimize2, Image as ImageIcon,
  Edit2, Play, X, Copy, Wand2,
  AlertCircle
} from 'lucide-react';

interface MermaidProps {
  chart: string;
}

const cleanMermaidSyntax = (raw: string): string => {
  let clean = raw
    .replace(/```mermaid/g, '')
    .replace(/```/g, '')
    .trim();

  // 1. Fix Arrow Syntax (Standardize)
  clean = clean.replace(/-\s+->/g, '-->'); 
  clean = clean.replace(/=\s+=>/g, '==>');

  // 2. Handle "Term :: Definition" pattern 
  clean = clean.replace(/"([^"]*)"/g, (match, content) => {
     let processed = content.replace(/\n/g, '<br/>');
     processed = processed.replace(/\s*::\s*/g, '<br/>');
     return `"${processed}"`;
  });

  clean = clean.replace(/\[([^"\]]+)\]/g, (match, content) => {
      if (content.includes('::')) {
          const processed = content.replace(/\s*::\s*/g, '<br/>');
          return `["${processed}"]`;
      }
      return match;
  });
  
  clean = clean.replace(/\(([^"\)]+)\)/g, (match, content) => {
      if (content.includes('::')) {
          const processed = content.replace(/\s*::\s*/g, '<br/>');
          return `("${processed}")`;
      }
      return match;
  });

  return clean;
};

const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // STATE
  const [internalChart, setInternalChart] = useState(chart);
  const [draftCode, setDraftCode] = useState(chart);
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [svgContent, setSvgContent] = useState<string>('');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const uniqueId = useMemo(() => `mermaid-${Math.random().toString(36).substr(2, 9)}`, []);

  useEffect(() => {
    if (!isEditing) {
        const cleaned = cleanMermaidSyntax(chart);
        setInternalChart(cleaned);
        setDraftCode(cleaned); 
    }
  }, [chart, isEditing]); 

  // --- RENDER ENGINE ---
  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      if (!internalChart) return;
      setStatus('loading');
      setErrorMsg('');
      
      try {
        const mermaid = (await import('mermaid')).default;
        // Re-initialize to ensure config is fresh
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          fontFamily: 'Inter, sans-serif',
          themeVariables: {
            primaryColor: '#ffffff',
            primaryBorderColor: '#374151',
            primaryTextColor: '#111827',
            lineColor: '#4b5563',
            secondaryColor: '#f3f4f6',
            tertiaryColor: '#ffffff',
            fontSize: '16px', 
          },
          flowchart: { 
              htmlLabels: true, 
              curve: 'basis', 
              padding: 15,
              useMaxWidth: false 
          },
        });

        // Use try-catch block specifically for the render function
        try {
            const { svg } = await mermaid.render(uniqueId, internalChart);
            if (isMounted) {
              const styleInjection = `
                <style>
                  #${uniqueId} .node rect, #${uniqueId} .node circle, #${uniqueId} .node polygon { 
                    fill: #ffffff !important; stroke: #374151 !important; stroke-width: 1.5px !important; 
                  }
                  #${uniqueId} .edgePath .path { stroke: #4b5563 !important; stroke-width: 1.5px !important; }
                  #${uniqueId} .node foreignObject { overflow: visible !important; }
                  #${uniqueId} .node foreignObject div {
                    display: flex !important; justify-content: center !important; align-items: center !important;
                    text-align: center !important; 
                    white-space: normal !important;
                    word-wrap: break-word !important;
                    max-width: 280px !important; 
                    line-height: 1.4 !important; 
                    font-size: 13px !important;
                    color: #111827 !important;
                    padding: 4px !important;
                  }
                </style>
              `;
              
              let styledSvg = svg.replace('>', `>${styleInjection}`);
              styledSvg = styledSvg.replace(/width="[^"]*"/, '').replace(/height="[^"]*"/, '');
              styledSvg = styledSvg.replace(/style="[^"]*"/, 'style="width: 100%; height: 100%; overflow: visible;"');
              
              setSvgContent(styledSvg);
              setStatus('success');
              setTransform({ x: 0, y: 0, scale: 1 }); 
            }
        } catch (renderError: any) {
            console.warn("Mermaid inner render error", renderError);
            throw new Error("Syntax Error: " + (renderError.message || "Invalid Diagram"));
        }

      } catch (err: any) {
        if (isMounted) {
          setStatus('error');
          setErrorMsg(err.message || 'Syntax Error');
        }
      }
    };
    
    renderChart();
    return () => { isMounted = false; };
  }, [internalChart, uniqueId]);

  // --- HANDLERS ---
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isFullscreen && !e.ctrlKey) return; 
    e.stopPropagation();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    setTransform(prev => ({ ...prev, scale: Math.min(Math.max(0.5, prev.scale + delta), 4) }));
  }, [isFullscreen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setTransform(prev => ({ ...prev, x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y }));
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleUpdate = () => {
    setInternalChart(draftCode);
    setIsEditing(false);
  };

  const handleAutoFix = () => {
      const fixed = cleanMermaidSyntax(draftCode);
      setDraftCode(fixed);
  };

  const downloadImage = () => {
    if (!containerRef.current) return;
    const svgElement = containerRef.current.querySelector('svg');
    if (!svgElement) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgElement);
    const svgBlob = new Blob([source], {type:"image/svg+xml;charset=utf-8"});
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = function() {
        const canvas = document.createElement("canvas");
        const bbox = svgElement.getBBox();
        canvas.width = (bbox.width + 100) * 2;
        canvas.height = (bbox.height + 100) * 2;
        const ctx = canvas.getContext("2d");
        if(ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.scale(2, 2);
            ctx.drawImage(img, 50, 50); 
            const pngUrl = canvas.toDataURL("image/png");
            const a = document.createElement("a");
            a.href = pngUrl;
            a.download = "diagram.png";
            a.click();
        }
    };
    img.src = url;
  };

  // --- UI COMPONENTS ---

  if (status === 'error' && !isEditing) {
    return (
      <div className="my-6 p-4 rounded-lg border border-red-200 bg-red-50 flex flex-col items-center justify-center text-center">
         <AlertCircle className="text-red-500 mb-2" size={20}/>
         <h3 className="text-xs font-bold text-red-900 uppercase">Diagram Error</h3>
         <p className="text-[10px] text-red-600 mt-1 mb-3 max-w-md font-mono line-clamp-2">{errorMsg}</p>
         <div className="flex gap-2">
             <button 
               onClick={() => setIsEditing(true)}
               className="px-3 py-1 bg-white border border-red-200 text-red-700 rounded text-xs font-bold hover:bg-red-50 transition-colors shadow-sm"
             >
               Fix Code
             </button>
             <button
               onClick={() => setStatus('success')} // Force show raw code
               className="px-3 py-1 bg-transparent border border-red-300 text-red-600 rounded text-xs hover:bg-red-50"
             >
               Ignore
             </button>
         </div>
      </div>
    );
  }

  return (
    <div className={`
        relative my-6 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col group
        ${isFullscreen ? 'fixed inset-0 z-[100] h-screen m-0 rounded-none' : isEditing ? 'h-[500px]' : 'h-[350px] md:h-[450px]'}
    `}>
      
      {/* HEADER / TOOLBAR */}
      <div className="h-8 border-b border-gray-100 flex items-center justify-between px-2 bg-gray-50/80 shrink-0">
         <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pl-1">Mermaid</span>
            {status === 'loading' && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"/>}
         </div>
         
         <div className="flex items-center gap-0.5">
            {!isEditing ? (
              <>
                <button onClick={() => setIsEditing(true)} className="p-1.5 hover:bg-white hover:shadow-sm rounded text-gray-500 hover:text-blue-600 transition-all" title="Edit Source"><Edit2 size={13}/></button>
                <button onClick={downloadImage} className="p-1.5 hover:bg-white hover:shadow-sm rounded text-gray-500 transition-all" title="Download PNG"><ImageIcon size={13}/></button>
                <div className="w-[1px] h-3 bg-gray-300 mx-1"></div>
                <button onClick={() => setTransform({x:0,y:0,scale:1})} className="p-1.5 hover:bg-white hover:shadow-sm rounded text-gray-500 transition-all" title="Reset View"><RotateCcw size={13}/></button>
                <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 hover:bg-white hover:shadow-sm rounded text-gray-500 transition-all" title="Fullscreen">
                   {isFullscreen ? <Minimize2 size={13}/> : <Maximize size={13}/>}
                </button>
              </>
            ) : (
                <button onClick={() => setIsEditing(false)} className="p-1.5 hover:bg-red-50 text-gray-500 hover:text-red-500 rounded transition-colors"><X size={13}/></button>
            )}
         </div>
      </div>

      {/* CONTENT AREA */}
      {isEditing ? (
          <div className="flex-1 flex flex-col relative bg-white">
              <div className="flex-1 relative">
                  <textarea 
                      value={draftCode}
                      onChange={(e) => setDraftCode(e.target.value)}
                      className="w-full h-full p-4 font-mono text-[11px] leading-relaxed bg-[#1e1e1e] text-gray-300 outline-none resize-none custom-scrollbar"
                      spellCheck={false}
                  />
              </div>
              
              {/* COMPACT FOOTER TOOLBAR */}
              <div className="h-9 border-t border-gray-200 bg-gray-50 flex justify-between items-center px-2">
                  <div className="flex gap-1">
                      <button onClick={handleAutoFix} className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-300 text-purple-600 rounded text-[10px] font-bold hover:bg-purple-50 transition-colors" title="Fix Common Syntax Errors">
                          <Wand2 size={10}/> Auto-Fix
                      </button>
                      <button onClick={() => navigator.clipboard.writeText(draftCode)} className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-300 text-gray-600 rounded text-[10px] font-bold hover:bg-gray-100 transition-colors">
                          <Copy size={10}/> Copy
                      </button>
                  </div>
                  <button onClick={handleUpdate} className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold hover:bg-blue-700 transition-colors shadow-sm">
                      <Play size={10} fill="currentColor"/> Render
                  </button>
              </div>
          </div>
      ) : (
          <div 
            className={`flex-1 overflow-hidden relative w-full h-full bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            ref={containerRef}
          >
            <div 
               className="absolute top-0 left-0 w-full h-full flex items-center justify-center origin-center transition-transform duration-75 ease-out"
               style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
               dangerouslySetInnerHTML={{ __html: svgContent }}
            />
            {status === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
            )}
          </div>
      )}
    </div>
  );
};

export default React.memo(Mermaid);
