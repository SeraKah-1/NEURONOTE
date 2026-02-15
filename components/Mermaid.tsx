
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  ZoomIn, ZoomOut, RotateCcw, Download, 
  AlertTriangle, Maximize, Move, Image as ImageIcon,
  Edit2, Play, X, Copy, Check, Wand2
} from 'lucide-react';

interface MermaidProps {
  chart: string;
}

/**
 * ----------------------------------------------------------------------------
 * HELPER: SYNTAX SANITIZER
 * Membersihkan kesalahan umum sintaks Mermaid yang sering dilakukan LLM.
 * ----------------------------------------------------------------------------
 */
const cleanMermaidSyntax = (raw: string): string => {
  let clean = raw
    .replace(/```mermaid/g, '') // Hapus blok markdown
    .replace(/```/g, '')
    .trim();

  // Fix: Panah rusak (LLM sering menambah spasi)
  clean = clean.replace(/-\s+->/g, '-->'); 
  clean = clean.replace(/=\s+=>/g, '==>');

  // Fix: Newline handling. Mermaid prefers <br/> over \n for accurate box sizing in nodes.
  // We replace \n inside quotes with <br/>
  clean = clean.replace(/"([^"]*)"/g, (match, content) => {
     return `"${content.replace(/\n/g, '<br/>')}"`;
  });
  
  return clean;
};

const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // STATE
  const [internalChart, setInternalChart] = useState(chart); // Chart yang aktif dirender
  const [draftCode, setDraftCode] = useState(chart); // Chart yang sedang diedit di textarea
  const [isEditing, setIsEditing] = useState(false); // Mode edit toggle
  
  const [svgContent, setSvgContent] = useState<string>('');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [fixed, setFixed] = useState(false); // State for feedback animation
  const [shake, setShake] = useState(false); // State for "no change" feedback
  
  // --- PAN & ZOOM STATE ---
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Unique ID untuk isolasi style
  const uniqueId = useMemo(() => `mermaid-${Math.random().toString(36).substr(2, 9)}`, []);

  // Sync prop changes to internal state
  useEffect(() => {
    if (!isEditing) {
        setInternalChart(chart);
        setDraftCode(chart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart]); 

  // --- RENDER ENGINE ---
  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      if (!internalChart) return;
      
      setStatus('loading');
      setErrorMsg(''); // Reset error
      
      try {
        const mermaid = (await import('mermaid')).default;

        // KONFIGURASI TEMA KLINIS
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          fontFamily: 'Inter, sans-serif',
          themeVariables: {
            primaryColor: '#ffffff',
            primaryBorderColor: '#000000',
            primaryTextColor: '#000000',
            lineColor: '#000000',
            secondaryColor: '#f1f5f9',
            tertiaryColor: '#fff',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px', // SINKRONISASI: Harus sama dengan CSS injection (14px) agar perhitungan kotak akurat
          },
          flowchart: { 
            htmlLabels: true,
            curve: 'basis',
            padding: 20, // More padding to prevent edge clipping
            useMaxWidth: false,
            wrappingWidth: 250, // AKTIFKAN: Memaksa mermaid menghitung tinggi kotak berdasarkan lebar maksimum teks
          },
          mindmap: { useMaxWidth: false }
        });

        const cleanedChart = cleanMermaidSyntax(internalChart);
        
        // Render ke string SVG
        const { svg } = await mermaid.render(uniqueId, cleanedChart);
        
        if (isMounted) {
          // --- INJEKSI CSS "NUCLEAR" ---
          // Menggunakan Flexbox centering yang lebih robust untuk ForeignObject
          // Font size diset sedikit lebih kecil di CSS (13.5px) daripada config JS (14px) 
          // untuk memastikan teks selalu muat di dalam kotak yang dihitung Mermaid.
          const styleInjection = `
            <style>
              #${uniqueId} .node rect, #${uniqueId} .node circle, #${uniqueId} .node polygon, #${uniqueId} .node path { 
                fill: #ffffff !important; stroke: #000000 !important; stroke-width: 2px !important; 
              }
              #${uniqueId} .edgePath .path { stroke: #000000 !important; stroke-width: 2px !important; }
              #${uniqueId} .marker { fill: #000000 !important; stroke: #000000 !important; }
              #${uniqueId} .node foreignObject { overflow: visible !important; }
              #${uniqueId} .nodeLabel, #${uniqueId} .label { color: #000000 !important; fill: #000000 !important; }
              
              /* FIX TEXT OVERFLOW */
              #${uniqueId} .node foreignObject div {
                display: flex !important; 
                justify-content: center !important;
                align-items: center !important;
                text-align: center !important; 
                
                white-space: pre-wrap !important; 
                word-wrap: break-word !important;
                
                line-height: 1.4 !important; 
                font-size: 13.5px !important; /* Safety margin vs 14px calculation */
                width: 100% !important;
                height: 100% !important;
              }
            </style>
          `;

          let styledSvg = svg.replace('>', `>${styleInjection}`);
          styledSvg = styledSvg.replace(/width="[^"]*"/, '').replace(/height="[^"]*"/, '');
          styledSvg = styledSvg.replace(/style="[^"]*"/, 'style="width: 100%; height: 100%; overflow: visible;"');
          
          setSvgContent(styledSvg);
          setStatus('success');
          // Reset Zoom saat render ulang
          setTransform({ x: 0, y: 0, scale: 1 }); 
        }
      } catch (err: any) {
        console.error("Mermaid Render Error:", err);
        if (isMounted) {
          setStatus('error');
          setErrorMsg(err.message || 'Syntax Error');
        }
      }
    };

    renderChart();
    return () => { isMounted = false; };
  }, [internalChart, uniqueId]);

  // --- INTERACTION HANDLERS ---
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    if (e.ctrlKey) return; 
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    setTransform(prev => ({ ...prev, scale: Math.min(Math.max(0.5, prev.scale + delta), 4) }));
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setTransform(prev => ({ ...prev, x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }));
  };

  const handleMouseUp = () => setIsDragging(false);

  // --- ACTIONS ---
  const handleCopyCode = () => {
    navigator.clipboard.writeText(draftCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAutoFix = () => {
      let code = draftCode;
      const original = code;

      // 1. GLOBAL FIX: Nested Quotes in Parentheses (High Priority)
      code = code.replace(/\(\s*"([^"\n\)]+)"\s*\)/g, '($1)');

      // 2. Fix Broken Arrows
      code = code.replace(/-\s+->/g, '-->').replace(/=\s+=>/g, '==>');
      code = code.replace(/-\s+\.\s+->/g, '-.->').replace(/-\.\s+->/g, '-.->');

      // 3. Fix Mixed Arrow Syntax
      code = code.replace(/--\s*"([^"]+)"\s*-\.->\s*\|"([^"]+)"\|/g, '-. "$1: $2" .->');
      code = code.replace(/--\s*"([^"]+)"\s*-\.->/g, '-. "$1" .->');
      
      // 4. Fix Mixed Solid Arrow Syntax
      code = code.replace(/--\s*"([^"]+)"\s*-->\s*\|"([^"]+)"\|/g, '-- "$1: $2" -->');

      // 5. Fix Unquoted Brackets with Parentheses inside
      code = code.replace(/\[([^"\]]*\(.*?\)[^"\]]*)\]/g, (m, content) => {
          if (content.startsWith('"') || content.endsWith('"')) return `[${content}]`;
          return `["${content}"]`;
      });
      
      // 6. Fix Unquoted Round Parentheses with Parentheses inside
      code = code.replace(/\(([^\)"\n]*\(.*?\)[^\)"\n]*)\)/g, (m, content) => {
           if (content.startsWith('"') || content.endsWith('"')) return `(${content})`;
           return `("${content}")`;
      });

      // 7. Specific catch for the ["("Text")"] pattern
      code = code.replace(/\[\s*"\s*\(\s*"\s*(.*?)\s*"\s*\)\s*"\s*[\]\}]/g, '["($1)"]');
      
      // 8. Generic Curly Brace Typo Fix
      code = code.replace(/\["([^"]+)"\}/g, '["$1"]');

      // 9. Ensure Newlines are <br/> inside quotes (Mermaid standard for multiline)
      code = code.replace(/"([^"]*)"/g, (match, content) => {
           if (content.includes('<br')) return match;
           if (content.includes('\n')) return `"${content.replace(/\n/g, '<br/>')}"`;
           return match;
      });

      if (code !== original) {
          setDraftCode(code);
          setFixed(true);
          setTimeout(() => setFixed(false), 2000);
      } else {
          setShake(true);
          setTimeout(() => setShake(false), 500);
      }
  };

  const handleRenderManual = () => {
    setInternalChart(draftCode);
    setIsEditing(false);
  };

  const downloadImage = async () => {
    if (!containerRef.current) return;
    const svgElement = containerRef.current.querySelector('svg');
    if (!svgElement) return;

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);
    if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const svgBlob = new Blob([source], {type:"image/svg+xml;charset=utf-8"});
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = function() {
        const canvas = document.createElement("canvas");
        const bbox = svgElement.getBBox();
        const width = bbox.width + 50; 
        const height = bbox.height + 50;
        canvas.width = width * 2;
        canvas.height = height * 2;
        const ctx = canvas.getContext("2d");
        if(ctx) {
            ctx.scale(2, 2);
            ctx.fillStyle = "#FFFFFF"; 
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, -bbox.x + 25, -bbox.y + 25, bbox.width, bbox.height);
            const pngUrl = canvas.toDataURL("image/png");
            const downloadLink = document.createElement("a");
            downloadLink.href = pngUrl;
            downloadLink.download = `neuronote_diagram_${Date.now()}.png`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        }
    };
    img.src = url;
  };

  const resetView = () => setTransform({ x: 0, y: 0, scale: 1 });
  const zoomIn = () => setTransform(p => ({ ...p, scale: Math.min(p.scale + 0.2, 4) }));
  const zoomOut = () => setTransform(p => ({ ...p, scale: Math.max(p.scale - 0.2, 0.5) }));

  // --- ERROR DISPLAY ---
  if (status === 'error' && !isEditing) {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-4 my-4 flex flex-col gap-3">
         <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
            <AlertTriangle size={16}/> Rendering Error
         </div>
         <p className="text-xs text-red-500 font-mono bg-white p-2 rounded border border-red-100 overflow-auto">
            {errorMsg}
         </p>
         <button 
           onClick={() => setIsEditing(true)} 
           className="self-start flex items-center gap-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-bold transition-colors"
         >
            <Edit2 size={12}/> Fix Code
         </button>
      </div>
    );
  }

  return (
    <div className={`relative group my-6 border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm transition-shadow hover:shadow-md ${isEditing ? 'h-[500px]' : 'h-[400px] md:h-[500px]'} flex flex-col`}>
      
      {/* TOOLBAR (Floating) */}
      {!isEditing && (
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
           <div className="bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-lg p-1 flex flex-col gap-1 pointer-events-auto">
              <button onClick={() => setIsEditing(true)} className="p-1.5 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded transition-colors" title="Edit Diagram"><Edit2 size={16}/></button>
              <div className="h-[1px] bg-gray-200 mx-1 my-0.5"></div>
              <button onClick={zoomIn} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Zoom In"><ZoomIn size={16}/></button>
              <button onClick={resetView} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Reset View"><RotateCcw size={16}/></button>
              <button onClick={zoomOut} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Zoom Out"><ZoomOut size={16}/></button>
           </div>
           <div className="bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-lg p-1 mt-1 pointer-events-auto">
              <button onClick={downloadImage} className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded text-gray-600 transition-colors" title="Download PNG">
                  <ImageIcon size={16}/>
              </button>
           </div>
        </div>
      )}

      {/* EDITOR MODE */}
      {isEditing ? (
          <div className="flex flex-col h-full bg-gray-50 animate-fade-in">
              <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-white">
                  <span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                     <Edit2 size={14}/> Raw Code Editor
                  </span>
                  <div className="flex gap-2">
                     <button 
                         onClick={handleAutoFix}
                         className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold transition-all border 
                         ${fixed ? 'bg-green-100 text-green-700 border-green-200' : 
                           shake ? 'bg-red-100 text-red-700 border-red-200 animate-pulse' :
                           'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'}`}
                         title="Auto-fix formatting errors"
                     >
                         {fixed ? <Check size={12}/> : <Wand2 size={12}/>}
                         {fixed ? 'Fixed!' : shake ? 'No Fix Needed' : 'Auto Fix'}
                     </button>
                     <div className="w-[1px] h-4 bg-gray-300 mx-1 self-center"></div>
                     <button onClick={handleCopyCode} className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs font-bold transition-colors">
                        {copied ? <Check size={12}/> : <Copy size={12}/>} Copy
                     </button>
                     <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 hover:bg-gray-100 text-gray-500 rounded text-xs font-bold transition-colors">
                        Cancel
                     </button>
                  </div>
              </div>
              <textarea 
                  value={draftCode}
                  onChange={(e) => setDraftCode(e.target.value)}
                  className="flex-1 w-full p-4 font-mono text-xs bg-[#1e1e1e] text-gray-300 resize-none outline-none custom-scrollbar"
                  spellCheck={false}
              />
              <div className="p-3 bg-white border-t border-gray-200 flex justify-end">
                  <button 
                    onClick={handleRenderManual}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-lg transition-transform active:scale-95"
                  >
                     <Play size={14} fill="currentColor"/> Render Diagram
                  </button>
              </div>
          </div>
      ) : (
          /* CANVAS MODE */
          <div 
            className={`flex-1 overflow-hidden relative w-full h-full bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            ref={containerRef}
          >
            {status === 'loading' && (
               <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px] z-10">
                  <div className="flex flex-col items-center gap-2">
                     <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                     <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Rendering...</span>
                  </div>
               </div>
            )}

            {/* SVG CONTAINER */}
            <div 
               className="absolute top-0 left-0 w-full h-full flex items-center justify-center origin-center transition-transform duration-75 ease-out"
               style={{
                 transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
               }}
               dangerouslySetInnerHTML={{ __html: svgContent }}
            />
            
            {/* HINT OVERLAY */}
            {status === 'success' && transform.scale === 1 && transform.x === 0 && (
               <div className="absolute bottom-3 left-3 pointer-events-none opacity-50 group-hover:opacity-0 transition-opacity">
                  <div className="bg-white/80 backdrop-blur px-2 py-1 rounded border border-gray-200 text-[10px] text-gray-500 flex items-center gap-1">
                     <Move size={10}/> Pan & Zoom Enabled
                  </div>
               </div>
            )}
          </div>
      )}
    </div>
  );
};

export default React.memo(Mermaid);
