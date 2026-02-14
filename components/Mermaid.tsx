
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  ZoomIn, ZoomOut, RotateCcw, Download, 
  AlertTriangle, Maximize, Move, Image as ImageIcon 
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
  
  // Fix: Node labels tanpa quote yang menyebabkan error pada karakter spesial
  // Regex ini mencoba menangkap pola id[Label Text] dan mengubahnya jadi id["Label Text"]
  // Ini tidak sempurna tapi menangani 80% kasus.
  clean = clean.replace(/(\w+)(\[|\(|\{)([^"\[\]\(\)\{\}]+)(\]|\)|\})/g, '$1$2"$3"$4');

  return clean;
};

const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  // --- PAN & ZOOM STATE ---
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Unique ID untuk isolasi style
  const uniqueId = useMemo(() => `mermaid-${Math.random().toString(36).substr(2, 9)}`, []);

  // --- RENDER ENGINE ---
  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      if (!chart) return;
      
      setStatus('loading');
      
      try {
        // Dynamic Import untuk performa (Lazy Load)
        const mermaid = (await import('mermaid')).default;

        // KONFIGURASI TEMA KLINIS (HIGH CONTRAST & ADAPTIVE SIZING)
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base', // Base theme allows variable override
          securityLevel: 'loose', // Diperlukan untuk HTML labels
          fontFamily: 'Inter, sans-serif',
          themeVariables: {
            primaryColor: '#ffffff',
            primaryBorderColor: '#000000',
            primaryTextColor: '#000000',
            lineColor: '#000000',
            secondaryColor: '#f1f5f9',
            tertiaryColor: '#fff',
            fontFamily: 'Inter, sans-serif',
            fontSize: '16px', // Calculate with slightly larger font to ensure box is big enough
          },
          flowchart: { 
            htmlLabels: true, // Wajib true agar CSS wrapping bekerja
            curve: 'basis',
            padding: 20,
            useMaxWidth: false, // JANGAN batasi lebar, biarkan canvas yang mengatur
            wrappingWidth: 300, // CRITICAL: Tell Mermaid to wrap text at this width during layout calculation
          },
          mindmap: {
            useMaxWidth: false,
          }
        });

        const cleanedChart = cleanMermaidSyntax(chart);
        
        // Render ke string SVG
        const { svg } = await mermaid.render(uniqueId, cleanedChart);
        
        if (isMounted) {
          // --- INJEKSI CSS "NUCLEAR" (Fixed Text Clipping) ---
          // Kita memaksa foreignObject (kontainer HTML dalam SVG) untuk flexible
          const styleInjection = `
            <style>
              /* 1. SHAPES: High Contrast */
              #${uniqueId} .node rect, 
              #${uniqueId} .node circle, 
              #${uniqueId} .node polygon,
              #${uniqueId} .node path { 
                fill: #ffffff !important; 
                stroke: #000000 !important; 
                stroke-width: 2px !important; 
              }
              
              /* 2. LINES: High Contrast */
              #${uniqueId} .edgePath .path { 
                stroke: #000000 !important; 
                stroke-width: 2px !important; 
              }
              #${uniqueId} .marker { 
                fill: #000000 !important; 
                stroke: #000000 !important; 
              }
              
              /* 3. TEXT FIXES (Anti-Clipping) */
              #${uniqueId} .node foreignObject { 
                overflow: visible !important; 
              }
              
              #${uniqueId} .nodeLabel, 
              #${uniqueId} .label { 
                color: #000000 !important;
                fill: #000000 !important;
              }

              /* Ini kunci agar teks panjang turun ke bawah dan center */
              #${uniqueId} .node foreignObject div {
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                text-align: center !important;
                white-space: normal !important; 
                word-wrap: break-word !important;
                max-width: 300px !important; /* Match wrappingWidth */
                line-height: 1.5 !important;
                font-size: 14px !important; /* Render slightly smaller than calculated (16px) */
              }
            </style>
          `;

          // Masukkan style ke dalam SVG string
          // Kita juga menghapus width/height statis dari SVG agar responsif di dalam canvas pan/zoom
          let styledSvg = svg.replace('>', `>${styleInjection}`);
          styledSvg = styledSvg.replace(/width="[^"]*"/, '').replace(/height="[^"]*"/, '');
          styledSvg = styledSvg.replace(/style="[^"]*"/, 'style="width: 100%; height: 100%; overflow: visible;"');
          
          setSvgContent(styledSvg);
          setStatus('success');
          
          // Reset Zoom saat chart baru dimuat
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
  }, [chart, uniqueId]);

  // --- INTERACTION HANDLERS ---

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Zoom logic (Mendekat ke kursor)
    e.stopPropagation();
    // Jika user menekan Ctrl, kita biarkan default behavior (browser zoom), jika tidak, kita zoom canvas
    // Tapi untuk komponen ini, kita buat wheel selalu zoom canvas jika hover
    if (e.ctrlKey) return; 
    
    // e.preventDefault() tidak bisa dipanggil di React synthetic event untuk wheel pasif
    
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newScale = Math.min(Math.max(0.5, transform.scale + delta), 4);
    
    setTransform(prev => ({
      ...prev,
      scale: newScale
    }));
  }, [transform.scale]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setTransform(prev => ({
      ...prev,
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    }));
  };

  const handleMouseUp = () => setIsDragging(false);

  // --- TOOLBAR ACTIONS ---

  const downloadImage = async () => {
    if (!containerRef.current) return;
    const svgElement = containerRef.current.querySelector('svg');
    if (!svgElement) return;

    // Serialize SVG
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);

    // Add XML namespaces
    if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // Convert to Data URL
    const svgBlob = new Blob([source], {type:"image/svg+xml;charset=utf-8"});
    const url = URL.createObjectURL(svgBlob);

    // Draw to Canvas to convert to PNG
    const img = new Image();
    img.onload = function() {
        const canvas = document.createElement("canvas");
        // Get strict bounding box
        const bbox = svgElement.getBBox();
        const width = bbox.width + 50; // Add margin
        const height = bbox.height + 50;

        // High Res Export (2x)
        canvas.width = width * 2;
        canvas.height = height * 2;
        const ctx = canvas.getContext("2d");
        if(ctx) {
            ctx.scale(2, 2);
            ctx.fillStyle = "#FFFFFF"; // Force White Background
            ctx.fillRect(0, 0, width, height);
            
            // Draw image centered relative to the bounding box
            // We need to account for negative coordinates if the chart grows upwards/leftwards
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

  // --- RENDER ---

  if (status === 'error') {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-4 my-4 flex flex-col gap-2">
         <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
            <AlertTriangle size={16}/> Rendering Error
         </div>
         <p className="text-xs text-red-500 font-mono bg-white p-2 rounded border border-red-100 overflow-auto">
            {errorMsg}
         </p>
         <details className="text-[10px] text-gray-500 cursor-pointer">
            <summary>Show Raw Code</summary>
            <pre className="mt-2 p-2 bg-gray-100 rounded overflow-auto max-h-40">
               {chart}
            </pre>
         </details>
      </div>
    );
  }

  return (
    <div className="relative group my-6 border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm transition-shadow hover:shadow-md h-[400px] md:h-[500px] flex flex-col">
      
      {/* TOOLBAR (Floating) */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
         <div className="bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-lg p-1 flex flex-col gap-1">
            <button onClick={zoomIn} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Zoom In"><ZoomIn size={16}/></button>
            <button onClick={resetView} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Reset View"><RotateCcw size={16}/></button>
            <button onClick={zoomOut} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Zoom Out"><ZoomOut size={16}/></button>
         </div>
         <div className="bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-lg p-1 mt-1">
            <button onClick={downloadImage} className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded text-gray-600 transition-colors" title="Download PNG">
                <ImageIcon size={16}/>
            </button>
         </div>
      </div>

      {/* CANVAS */}
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
        
        {/* HINT OVERLAY (Only show initially) */}
        {status === 'success' && transform.scale === 1 && transform.x === 0 && (
           <div className="absolute bottom-3 left-3 pointer-events-none opacity-50 group-hover:opacity-0 transition-opacity">
              <div className="bg-white/80 backdrop-blur px-2 py-1 rounded border border-gray-200 text-[10px] text-gray-500 flex items-center gap-1">
                 <Move size={10}/> Pan & Zoom Enabled
              </div>
           </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(Mermaid);
