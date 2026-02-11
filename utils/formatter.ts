// Helper: Clean content for quotes
const cleanAndQuoteContent = (content: string): string => {
  if (!content || content.trim().length === 0) return ">";
  return content
    .trim()
    .split('\n')
    .map(line => line.trim() === "" ? ">" : `> ${line}`)
    .join('\n');
};

export const convertTagsToObsidian = (text: string): string => {
  const tagMap: Record<string, { type: string; icon: string }> = {
    'DEEP': { type: 'note', icon: '👁️' },
    'CLINIC': { type: 'tip', icon: '💊' },
    'ALERT': { type: 'warning', icon: '⚠️' },
    'INFO': { type: 'info', icon: 'ℹ️' },
    'TABLE': { type: 'example', icon: '📊' }
  };

  let processedText = text;

  for (const [tagName, config] of Object.entries(tagMap)) {
    // FIX: Menggunakan [\s\S]*? agar lebih fleksibel terhadap newline
    // Menangani kasus di mana body mungkin kosong atau tidak ada newline setelah title
    const pattern = new RegExp(`<<<${tagName}_START>>>\\s*(.*?)(?:\\n|\\s)(?=[\\s\\S])([\\s\\S]*?)<<<${tagName}_END>>>`, 'g');

    processedText = processedText.replace(pattern, (match, title, rawBody) => {
      const displayTitle = title.trim() || config.type.toUpperCase();
      const formattedBody = cleanAndQuoteContent(rawBody || "");
      return `> [!${config.type}]- ${config.icon} **${displayTitle}**\n${formattedBody}`;
    });
  }

  return processedText;
};

export const fixMermaidSyntax = (markdownText: string): string => {
  // Regex untuk menangkap blok mermaid
  return markdownText.replace(/```mermaid([\s\S]*?)```/g, (match, rawContent) => {
    let lines = rawContent.trim().split('\n');
    
    // 1. Cek tipe diagram
    const firstLine = lines[0]?.trim() || "";
    const isFlowchart = /^(graph|flowchart)/i.test(firstLine);
    
    // Jika kosong sama sekali, default ke graph TD
    if (!lines.some(l => /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|journey|gitGraph)/i.test(l))) {
      lines.unshift('graph TD');
    }

    // !! PENTING: Jangan otak-atik sintaks jika BUKAN flowchart/graph.
    // Sequence diagram, gantt, dll punya sintaks sangat berbeda.
    if (!isFlowchart && lines.length > 0 && !/^(graph|flowchart)/i.test(lines[0])) {
        return match; 
    }

    const fixedLines: string[] = [];

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('%%')) {
        fixedLines.push(line);
        continue;
      }

      // 1. Hapus bullet points hallucination (1. A --> B)
      line = line.replace(/^[\d\.\-\*\s]+(?=[a-zA-Z])/, '');

      // 2. Fix Panah (Hanya pattern umum flowchart)
      line = line
        .replace(/\s*-->\s*/g, ' --> ')
        .replace(/\s*->\s*/g, ' -> ')
        .replace(/\s*-\.->\s*/g, ' -.-> ')
        .replace(/\s*==>\s*/g, ' ==> ');

      // 3. Sanitasi Node Label (Lebih hati-hati)
      // Regex ini mencari pola ID[Isi] atau ID(Isi) atau ID{Isi}
      // Kita gunakan fungsi callback untuk membersihkan HANYA isinya
      line = line.replace(/(\b\w+)\s*([\[\(\{])(.+?)([\]\}\)])/g, (m, id, open, content, close) => {
          // Escape quotes di dalam label agar tidak merusak string
          let safeContent = content.replace(/"/g, "'");
          
          // FIX: Jangan hapus kurung () [] {} di dalam label secara membabi buta.
          // Cukup bungkus dengan quote agar Mermaid membacanya sebagai string literal
          return `${id}${open}"${safeContent.trim()}"${close}`;
      });

      // 4. Validasi sederhana
      // Jika baris tidak terlihat seperti sintaks mermaid yang valid (tidak ada panah, bukan subgraph, bukan definis node)
      // tapi berisi teks panjang, mungkin itu hallucination komentar.
      const validChars = /(-->|->|==>|-\.->|subgraph|end|classDef|style|click|\[|\(|\{)/;
      if (!validChars.test(line) && line.split(' ').length > 3) {
         line = `%% Possible hallucination ignored: ${line}`;
      }

      fixedLines.push(line);
    }

    return "```mermaid\n" + fixedLines.join('\n') + "\n```";
  });
};

export const processGeneratedNote = (rawText: string): string => {
  // Urutan penting: Fix mermaid dulu (agar tag di dalam mermaid tidak rusak, meski jarang),
  // lalu convert tags, lalu clean up table.
  
  // Hapus chatter AI "Here is the diagram" tapi HANYA jika berada di baris sendiri
  // agar tidak menghapus kalimat di tengah paragraf.
  let processed = rawText.replace(/^\s*(Here is|This is) the (mermaid )?diagram(:)?\s*$/gim, '');
  
  processed = fixMermaidSyntax(processed);
  processed = convertTagsToObsidian(processed);
  
  // Table cleanup: Hanya ubah jika benar-benar terlihat seperti separator tabel markdown
  processed = processed.replace(/\|-{4,}\|/g, '|---|'); 
  
  return processed;
};
