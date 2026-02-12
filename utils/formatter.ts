
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
  // Regex to find: ID + Bracket + Content + CloseBracket
  // Captures: 1=ID, 2=OpenBracket, 3=Content, 4=CloseBracket
  const nodeRegex = /([a-zA-Z0-9_]+)\s*([\[\(\{\>]+)(.*?)([\]\)\}\>]+)/g;

  if (line.trim().startsWith('style') || line.trim().startsWith('classDef') || line.trim().startsWith('subgraph') || line.trim().startsWith('click')) {
    return line;
  }

  return line.replace(nodeRegex, (match, id, open, content, close) => {
    let rawContent = content.trim();
    
    // STRIP & RE-WRAP LOGIC
    // 1. Remove existing outer quotes if they exist (both " and ')
    if ((rawContent.startsWith('"') && rawContent.endsWith('"')) || 
        (rawContent.startsWith("'") && rawContent.endsWith("'"))) {
      rawContent = rawContent.slice(1, -1);
    }

    // 2. Sanitize internal quotes: Convert ALL double quotes inside to single quotes
    // This prevents "Text with "Quote"" from breaking the new wrapper
    const safeContent = rawContent.replace(/"/g, "'");

    // 3. Re-wrap strictly with double quotes (Mermaid standard)
    return `${id}${open}"${safeContent}"${close}`;
  });
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
  // In Mermaid Mindmap, only ONE node can be at the root indentation level.
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
    // Indent everything else deeper than the virtual root (which is at indentation 2 usually)
    // We force a 4-space indent for all body lines relative to their start
    processedLines = bodyLines.map(l => "    " + l.trimStart());
  } else {
    // Single root safe. Keep lines but clean them.
    header = "mindmap";
    processedLines = bodyLines;
  }

  // 3. Cleanup Node Content
  processedLines = processedLines.map(l => {
    const m = l.match(/^(\s*)(.*)/);
    if (!m) return l;
    let indent = m[1];
    let text = m[2];

    // Remove list markers (AI habit)
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
  if (firstLine.includes('mindmap')) {
    return fixMindmap(codeBlock);
  }

  // --- STANDARD FLOWCHART / GRAPH HANDLER ---
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
    // e.g. "1. A --> B" becomes "A --> B"
    trimmed = trimmed.replace(/^[\d\.\-\*\+]+(?=\s*[a-zA-Z])/, '').trim();

    // 2. FIX HEADER MERGE (e.g. "flowchart TDA")
    trimmed = trimmed.replace(/^(graph|flowchart)\s+(TD|LR|TB|BT)([a-zA-Z0-9])/, '$1 $2\n$3');

    // 3. FIX ARROWS (Strict Mode)
    trimmed = fixMermaidArrows(trimmed);

    // 4. SANITIZE NODES (Quotes handling)
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
    'TABLE': { type: 'example', icon: '📊' }
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
