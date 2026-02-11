// ==========================================
// UTILITIES
// ==========================================

// Helper: Clean content for quotes inside callouts
const cleanAndQuoteContent = (content: string): string => {
  if (!content || content.trim().length === 0) return ">";
  return content
    .trim()
    .split('\n')
    .map(line => (line.trim() === "" ? ">" : `> ${line}`))
    .join('\n');
};

// ==========================================
// CORE FUNCTIONS
// ==========================================

/**
 * Mengubah tag custom <<<TAG_START>>> menjadi Obsidian Callouts
 */
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
    // Regex fleksibel: menangani newline atau spasi setelah title
    const pattern = new RegExp(
      `<<<${tagName}_START>>>\\s*(.*?)(?:\\n|\\s)(?=[\\s\\S])([\\s\\S]*?)<<<${tagName}_END>>>`,
      'g'
    );

    processedText = processedText.replace(pattern, (match, title, rawBody) => {
      const displayTitle = title.trim() || config.type.toUpperCase();
      const formattedBody = cleanAndQuoteContent(rawBody || "");
      return `> [!${config.type}]- ${config.icon} **${displayTitle}**\n${formattedBody}`;
    });
  }

  return processedText;
};

/**
 * Memperbaiki sintaks Mermaid yang rusak, terutama panah dan label node
 */
export const fixMermaidSyntax = (markdownText: string): string => {
  // Regex untuk menangkap blok mermaid
  return markdownText.replace(/```mermaid([\s\S]*?)```/g, (match, rawContent) => {
    let lines = rawContent.trim().split('\n');

    // 1. Cek tipe diagram (Default ke graph TD jika kosong/tidak jelas)
    const firstLine = lines[0]?.trim() || "";
    const isFlowchart = /^(graph|flowchart)/i.test(firstLine);

    if (
      !lines.some((l) =>
        /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|journey|gitGraph)/i.test(
          l
        )
      )
    ) {
      lines.unshift('graph TD');
    }

    // !! PENTING: Jangan otak-atik sintaks jika BUKAN flowchart/graph.
    // Sequence diagram, gantt, dll punya sintaks sangat berbeda dan rentan rusak.
    if (!isFlowchart && lines.length > 0 && !/^(graph|flowchart)/i.test(lines[0])) {
      return match;
    }

    const fixedLines: string[] = [];

    for (let line of lines) {
      line = line.trim();
      // Skip baris kosong atau komentar
      if (!line || line.startsWith('%%')) {
        fixedLines.push(line);
        continue;
      }

      // 1. Hapus bullet points hallucination (contoh: "1. A --> B")
      line = line.replace(/^[\d\.\-\*\s]+(?=[a-zA-Z])/, '');

      // 2. Fix Panah (CRITICAL UPDATE: Menangani panah putus "- ->")
      line = line
        // Tahap A: Sambungkan panah yang terputus oleh spasi
        .replace(/-\s+->/g, '-->')      // "- ->"  menjadi "-->"
        .replace(/=\s+=>/g, '==>')      // "= =>"  menjadi "==>"
        .replace(/-\s+\.->/g, '-.->')   // "- .->" menjadi "-.->"
        
        // Tahap B: Standarisasi spasi di sekitar panah (agar rapi)
        .replace(/\s*-->\s*/g, ' --> ')
        .replace(/\s*->\s*/g, ' -> ')
        .replace(/\s*-\.->\s*/g, ' -.-> ')
        .replace(/\s*==>\s*/g, ' ==> ');

      // 3. Sanitasi Node Label (Aman: Bungkus isi dengan quotes)
      // Mengubah A[Isi Teks] menjadi A["Isi Teks"] agar karakter aneh tidak merusak diagram
      line = line.replace(
        /(\b\w+)\s*([\[\(\{])(.+?)([\]\}\)])/g,
        (m, id, open, content, close) => {
          // Escape quotes di dalam label
          let safeContent = content.replace(/"/g, "'");
          return `${id}${open}"${safeContent.trim()}"${close}`;
        }
      );

      // 4. Validasi Sederhana (Hapus baris text biasa yang bukan sintaks graph)
      const validChars = /(-->|->|==>|-\.->|subgraph|end|classDef|style|click|\[|\(|\{)/;
      if (!validChars.test(line) && line.split(' ').length > 3) {
        line = `%% Possible hallucination ignored: ${line}`;
      }

      fixedLines.push(line);
    }

    return "```mermaid\n" + fixedLines.join('\n') + "\n```";
  });
};

/**
 * Main Entry Point: Proses keseluruhan text
 */
export const processGeneratedNote = (rawText: string): string => {
  // 1. Hapus chatter AI "Here is the diagram" (hanya jika di baris sendiri)
  let processed = rawText.replace(
    /^\s*(Here is|This is) the (mermaid )?diagram(:)?\s*$/gim,
    ''
  );

  // 2. Fix Mermaid Syntax (Termasuk panah putus)
  processed = fixMermaidSyntax(processed);

  // 3. Convert Custom Tags ke Obsidian Callouts
  processed = convertTagsToObsidian(processed);

  // 4. Table Cleanup (Menangani separator tabel |---| atau | --- |)
  processed = processed.replace(/\|\s*-{3,}\s*\|/g, '|---|');

  return processed;
};
