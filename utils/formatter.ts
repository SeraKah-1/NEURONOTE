// ==========================================
// UTILITIES
// ==========================================

/**
 * Helper: Membersihkan konten untuk dimasukkan ke dalam Callout/Blockquote.
 * Menangani baris kosong agar tetap memiliki prefix '>'.
 */
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
 * 1. CONVERT TAGS TO OBSIDIAN CALLOUTS
 * Mengubah tag custom <<<TAG_START>>> menjadi format Callout Obsidian.
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
    // Regex menangkap title dan body, fleksibel terhadap newline
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
 * 2. FIX MERMAID SYNTAX (THE CORE FIXER)
 * Memperbaiki panah putus, kutip ganda bertumpuk, dan halusinasi.
 */
export const fixMermaidSyntax = (markdownText: string): string => {
  // Regex untuk menangkap blok mermaid
  return markdownText.replace(/```mermaid([\s\S]*?)```/g, (match, rawContent) => {
    let lines = rawContent.trim().split('\n');

    // A. Cek Tipe Diagram
    // Jika tidak ada deklarasi tipe, default ke 'graph TD'
    const firstLine = lines[0]?.trim() || "";
    const isFlowchart = /^(graph|flowchart)/i.test(firstLine);
    const isKnownDiagram = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|mindmap|gantt|pie|journey|gitGraph)/i.test(firstLine);

    if (!isKnownDiagram) {
      lines.unshift('graph TD');
    }

    // B. PENGAMANAN: Jika bukan flowchart/graph/stateDiagram, 
    // jangan terlalu agresif memformat (takut merusak logic sequence/gantt)
    // Kita hanya jalankan fix basic.
    const aggressiveFix = /^(graph|flowchart|stateDiagram)/i.test(lines[0]);

    const fixedLines: string[] = [];

    for (let line of lines) {
      line = line.trim();
      
      // Skip baris kosong atau komentar
      if (!line || line.startsWith('%%')) {
        fixedLines.push(line);
        continue;
      }

      // 1. Hapus Bullet Points Halusinasi (Contoh: "1. A --> B")
      // Hanya lakukan ini pada flowchart
      if (aggressiveFix) {
        line = line.replace(/^[\d\.\-\*\s]+(?=[a-zA-Z])/, '');
      }

      // 2. FIX PANAH (BROKEN ARROWS)
      // Ini memperbaiki kasus user: "- ->" menjadi "-->"
      line = line
        .replace(/-\s+->/g, '-->')      // Fix: "- ->"
        .replace(/=\s+=>/g, '==>')      // Fix: "= =>"
        .replace(/-\s+\.->/g, '-.->')   // Fix: "- .->"
        
        // Standarisasi spasi agar rapi
        .replace(/\s*-->\s*/g, ' --> ')
        .replace(/\s*->\s*/g, ' -> ')
        .replace(/\s*-\.->\s*/g, ' -.-> ')
        .replace(/\s*==>\s*/g, ' ==> ');

      // 3. SANITASI NODE LABEL (FIX DOUBLE QUOTES)
      // Mengubah: A["Filtrat("Pre-Urin")"] menjadi A["Filtrat('Pre-Urin')"]
      if (aggressiveFix) {
        // Regex menangkap: ID + Kurung + Isi + KurungTutup
        line = line.replace(/([a-zA-Z0-9_]+)\s*([\[\(\{\>]+)(.*?)([\]\)\}\>]+)/g, (m, id, open, rawContent, close) => {
            
            let content = rawContent.trim();
            
            // a. Kupas kutip luar jika ada (e.g. "Isi")
            if (content.startsWith('"') && content.endsWith('"')) {
                content = content.slice(1, -1);
            }

            // b. Ganti semua kutip ganda (") di dalam menjadi kutip satu (')
            // Ini mencegah error syntax mermaid
            content = content.replace(/"/g, "'");

            // c. Bungkus ulang dengan aman
            return `${id}${open}"${content}"${close}`;
        });
      }

      // 4. Validasi Sederhana
      // Jika baris panjang tapi tidak ada simbol mermaid, mungkin itu teks nyasar.
      // Kecuali itu adalah judul "subgraph" atau "end" atau style class
      if (aggressiveFix) {
          const validKeywords = /(-->|->|==>|-\.->|subgraph|end|classDef|style|click|class|direction|:::)/;
          // Jika tidak ada keyword mermaid DAN tidak ada kurung node, anggap sampah/komentar
          if (!validKeywords.test(line) && !/[\[\(\{\>].*[\]\)\}\>]/.test(line) && line.split(' ').length > 3) {
             line = `%% Ignored text: ${line}`;
          }
      }

      fixedLines.push(line);
    }

    return "```mermaid\n" + fixedLines.join('\n') + "\n```";
  });
};

/**
 * 3. MAIN PROCESSOR
 * Fungsi utama yang dipanggil untuk memproses teks mentah.
 */
export const processGeneratedNote = (rawText: string): string => {
  // 1. Hapus chatter AI "Here is the diagram"
  let processed = rawText.replace(
    /^\s*(Here is|This is|I have generated) the (mermaid )?diagram(:)?\s*$/gim,
    ''
  );

  // 2. Fix Mermaid Syntax (Panah & Kutip)
  processed = fixMermaidSyntax(processed);

  // 3. Convert Custom Tags ke Obsidian Callouts
  processed = convertTagsToObsidian(processed);

  // 4. Table Cleanup (Menangani separator tabel |---| atau | --- |)
  processed = processed.replace(/\|\s*-{3,}\s*\|/g, '|---|');

  return processed;
};
