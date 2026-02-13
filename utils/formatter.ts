
/**
 * DETERMINISTIC FORMATTER
 * 
 * A pure logic-based processor to sanitize AI output without relying on self-correction.
 * Focuses heavily on fixing broken Mermaid.js syntax and Obsidian-style callouts.
 */

/* --- 1. MERMAID SYNTAX REPAIR --- */

const fixMermaidArrows = (line: string): string => {
  let fixed = line;

  // --- SIMPLE PATTERN REPLACEMENT (Manual Fixes) ---
  // Menangani kasus spesifik di mana AI sering menambahkan spasi

  // 1. Fix Standard Arrows (-->)
  fixed = fixed.replace(/-\s+-\s+>/g, '-->'); 
  fixed = fixed.replace(/-\s+->/g, '-->');
  fixed = fixed.replace(/--\s+>/g, '-->');
  fixed = fixed.replace(/-\s+>/g, '-->');

  // 2. Fix Dotted Arrows (-.->)
  fixed = fixed.replace(/-\s+\.\s+->/g, '-.->');
  fixed = fixed.replace(/-\.\s+->/g, '-.->');
  fixed = fixed.replace(/-\.-\s+>/g, '-.->');

  // 3. Fix Thick Arrows (==>)
  fixed = fixed.replace(/=\s+=\s+>/g, '==>');
  fixed = fixed.replace(/==\s+>/g, '==>');
  fixed = fixed.replace(/=\s+=>/g, '==>');

  return fixed;
};

const sanitizeNodeLabels = (line: string): string => {
  if (line.trim().startsWith('style') || line.trim().startsWith('classDef') || line.trim().startsWith('subgraph') || line.trim().startsWith('click')) {
    return line;
  }

  let fixed = line;

  // Helper to format content strictly: "'Content'"
  const formatContent = (content: string) => {
    let raw = content.trim();
    // Strip existing outer quotes
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1);
    }
    // Remove internal quotes to prevent breakage
    const safe = raw.replace(/['"]/g, "");
    return `"'${safe}'"`;
  };

  // APPLY REPLACEMENTS IN SPECIFIC ORDER (Longer patterns first)
  // This prevents '([' from being matched as '('

  // 1. Stadium: id([content])
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\(\[(.*?)\]\)/g, (m, id, c) => `${id}([${formatContent(c)}])`);

  // 2. Subroutine: id[[content]]
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\[\[(.*?)\]\]/g, (m, id, c) => `${id}[[${formatContent(c)}]]`);

  // 3. Cylinder: id[(content)]
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\[\((.*?)\)\]/g, (m, id, c) => `${id}[(${formatContent(c)})]`);

  // 4. Rhombus: id{{content}}
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\{\{(.*?)\}\}/g, (m, id, c) => `${id}{{${formatContent(c)}}}`);

  // 5. Asymmetric: id>content]
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\>(.*?)\]/g, (m, id, c) => `${id}>${formatContent(c)}]`);

  // 6. Standard Square: id[content]
  // Note: We use a non-greedy match. This handles `id[Text (Detail)]` correctly because `]` terminates it.
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\[(.*?)\]/g, (m, id, c) => `${id}[${formatContent(c)}]`);

  // 7. Standard Round: id(content)
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\((.*?)\)/g, (m, id, c) => `${id}(${formatContent(c)})`);

  // 8. Standard Curly: id{content}
  fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\{(.*?)\}/g, (m, id, c) => `${id}{${formatContent(c)}}`);

  return fixed;
};

/* --- MINDMAP SPECIFIC HANDLER --- */
const fixMindmap = (content: string): string => {
  const lines = content.split('\n');
  // Filter out comments and empty lines
  const validLines = lines.filter(l => l.trim().length > 0 && !l.trim().startsWith('%%') && !l.trim().startsWith('```'));
  
  // Normalize header
  let bodyLines = validLines;
  if (validLines.length > 0 && validLines[0].trim().includes('mindmap')) {
    bodyLines = validLines.slice(1);
  }

  if (bodyLines.length === 0) return "```mermaid\nmindmap\n  root((Empty))\n```";

  // 1. Detect Root Indentation
  const firstLineMatch = bodyLines[0].match(/^(\s*)/);
  const rootIndentLen = firstLineMatch ? firstLineMatch[1].length : 0;

  // 2. Check for Multiple Roots Violation
  const rootCandidates = bodyLines.filter(l => {
    const m = l.match(/^(\s*)/);
    const indent = m ? m[1].length : 0;
    return indent <= rootIndentLen;
  });

  let header = "mindmap";
  let processedLines: string[] = [];

  if (rootCandidates.length > 1) {
    // FIX: Multiple roots detected. Inject a virtual super-root.
    header = "mindmap\n  root((Overview))"; 
    processedLines = bodyLines.map(l => "    " + l.trimStart());
  } else {
    header = "mindmap";
    processedLines = bodyLines;
  }

  // 3. Cleanup Node Content
  processedLines = processedLines.map(l => {
    const m = l.match(/^(\s*)(.*)/);
    if (!m) return l;
    let indent = m[1];
    let text = m[2];

    // Remove list markers
    text = text.replace(/^[\-\*\+]\s+/, '');
    // Remove markdown bold
    text = text.replace(/\*\*/g, '');
    // Remove trailing colons
    text = text.replace(/:$/, '');
    
    return indent + text;
  });

  return "```mermaid\n" + header + "\n" + processedLines.join('\n') + "\n```";
};

const fixMermaidBlock = (codeBlock: string): string => {
  // ROUTING: Check diagram type
  const firstLine = codeBlock.trim().split('\n')[0].trim();
  
  // 1. Mindmap Handler
  if (firstLine.includes('mindmap')) {
    return fixMindmap(codeBlock);
  }

  // 2. Passthrough types (Sequence, Timeline, Quadrant)
  // These diagram types have very different syntax and should not be processed by the flowchart/graph sanitizer
  if (firstLine.includes('sequenceDiagram') || 
      firstLine.includes('timeline') || 
      firstLine.includes('quadrantChart') || 
      firstLine.includes('classDiagram')) {
    return "```mermaid\n" + codeBlock.trim() + "\n```";
  }

  // 3. STANDARD FLOWCHART / GRAPH HANDLER
  // Only apply strict node/arrow fixes to Flowcharts and Graphs
  const lines = codeBlock.split('\n');
  const fixedLines: string[] = [];

  for (let line of lines) {
    let trimmed = line.trim();

    // Skip empty lines or comments
    if (!trimmed || trimmed.startsWith('%%')) {
      fixedLines.push(line);
      continue;
    }

    // 1. REMOVE HALLUCINATIONS (List numbers/bullets at start of line)
    trimmed = trimmed.replace(/^[\d\.\-\*\+]+(?=\s*[a-zA-Z])/, '').trim();

    // 2. FIX HEADER MERGE (e.g. "flowchart TDA")
    trimmed = trimmed.replace(/^(graph|flowchart)\s+(TD|LR|TB|BT)([a-zA-Z0-9])/, '$1 $2\n$3');

    // 3. FIX ARROWS (Strict Mode)
    trimmed = fixMermaidArrows(trimmed);

    // 4. SANITIZE NODES (Apply strict "' '" Logic with correct bracket matching)
    trimmed = sanitizeNodeLabels(trimmed);

    fixedLines.push(trimmed);
  }

  return "```mermaid\n" + fixedLines.join('\n') + "\n```";
};

/* --- 2. OBSIDIAN TAG CONVERTER --- */

const cleanAndQuoteContent = (content: string): string => {
  const lines = content.trim().split('\n');
  return lines.map(line => line.trim() === "" ? ">" : `> ${line}`).join('\n');
};

const convertTagsToObsidian = (text: string): string => {
  const tagMap: Record<string, { type: string; icon: string }> = {
    'DEEP': { type: 'note', icon: '👁️' },
    'CLINIC': { type: 'tip', icon: '💊' },
    'ALERT': { type: 'warning', icon: '⚠️' },
    'INFO': { type: 'info', icon: 'ℹ️' },
    'TABLE': { type: 'example', icon: '📊' },
    'QUESTION': { type: 'question', icon: '❓' }, // Added
    'QUOTE': { type: 'quote', icon: '💬' } // Added
  };

  let processedText = text.replace(/<<<CLICNIC_END>>>/g, '<<<CLINIC_END>>>');

  for (const [tagName, config] of Object.entries(tagMap)) {
    const pattern = new RegExp(`<<<${tagName}_START>>>([\\s\\S]*?)<<<${tagName}_END>>>`, 'g');
    
    processedText = processedText.replace(pattern, (match, content) => {
      let cleanContent = content.trim();
      let title = config.type.toUpperCase();
      
      const titleMatch = cleanContent.match(/^\[(.*?)\]/);
      if (titleMatch) {
          title = titleMatch[1];
          cleanContent = cleanContent.substring(titleMatch[0].length).trim();
      } else {
          const lines = cleanContent.split('\n');
          if (lines.length > 0) {
             const firstLine = lines[0].trim();
             if (firstLine.length < 60 && (lines.length > 1 || firstLine.startsWith('**'))) {
                 title = firstLine.replace(/\*\*/g, '').replace(/:$/, '');
                 cleanContent = lines.slice(1).join('\n').trim();
             }
          }
      }

      if (title === config.type.toUpperCase() && cleanContent.startsWith('**')) {
          const endBold = cleanContent.indexOf('**', 2);
          if (endBold !== -1 && endBold < 60) {
               title = cleanContent.substring(2, endBold);
               cleanContent = cleanContent.substring(endBold + 2).trim();
          }
      }

      const formattedBody = cleanAndQuoteContent(cleanContent);
      return `> [!${config.type}]- ${config.icon} **${title}**\n${formattedBody}`;
    });
  }

  return processedText;
};

/* --- MAIN PROCESSOR --- */

export const processGeneratedNote = (rawText: string): string => {
  const mermaidBlockRegex = /```mermaid([\s\S]*?)```/g;
  let processed = rawText.replace(mermaidBlockRegex, (match, code) => fixMermaidBlock(code));

  processed = processed.replace(/-{4,}/g, '---');
  processed = convertTagsToObsidian(processed);

  return processed;
};
