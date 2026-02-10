import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidProps {
  chart: string;
}

const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: 'Inter',
    });

    const renderChart = async () => {
      if (!containerRef.current) return;
      
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        // Clean up the chart string slightly more if needed
        const cleanChart = chart.replace(/```mermaid/g, '').replace(/```/g, '').trim();
        
        const { svg } = await mermaid.render(id, cleanChart);
        setSvg(svg);
        setError(false);
      } catch (err) {
        console.error('Mermaid render error:', err);
        setError(true);
      }
    };

    renderChart();
  }, [chart]);

  if (error) {
    return (
      <div className="p-4 border border-red-900 bg-red-900/20 rounded text-red-200 text-sm font-mono">
        <p className="mb-2 font-bold">Failed to render diagram</p>
        <pre className="whitespace-pre-wrap text-xs opacity-70">{chart}</pre>
      </div>
    );
  }

  return (
    <div 
      className="mermaid-container my-6 flex justify-center bg-gray-900/50 p-4 rounded-lg border border-gray-800 overflow-x-auto"
      ref={containerRef}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export default Mermaid;