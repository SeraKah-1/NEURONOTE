
// Helper to clean content and add quotes for Markdown blockquotes
const cleanAndQuoteContent = (content: string): string => {
  const lines = content.trim().split('\n');
  const processedLines = lines.map(line => {
    if (line.trim() === "") {
      return ">";
    }
    return `> ${line}`;
  });
  return processedLines.join('\n');
};

// Main function to convert custom tags to Obsidian-style callouts
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
    const pattern = new RegExp(`<<<${tagName}_START>>>\\s*(.*?)\\n([\\s\\S]*?)<<<${tagName}_END>>>`, 'g');

    processedText = processedText.replace(pattern, (match, title, rawBody) => {
      try {
        const formattedBody = cleanAndQuoteContent(rawBody);
        return `> [!${config.type}]- ${config.icon} **${title.trim()}**\n${formattedBody}`;
      } catch (e) {
        return match;
      }
    });
  }

  return processedText;
};

// Function to fix broken Mermaid syntax from AI
export const fixMermaidSyntax = (markdownText: string): string => {
  const mermaidBlockPattern = /```mermaid([\s\S]*?)```/g;

  return markdownText.replace(mermaidBlockPattern, (match, rawContent) => {
    const lines = rawContent.split('\n');
    const fixedLines: string[] = [];

    // Ensure graph declaration exists if missing
    const hasDecl = lines.some((l) => /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap)/i.test(l.trim()));
    if (!hasDecl) {
      fixedLines.push('graph TD');
    }

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('%%')) continue;
      
      // 1. Remove generic list numbers often hallucinated by AI (e.g. "1. A --> B")
      line = line.replace(/^[\d\.\-\*\s]+(?=\w)/, '');

      // 2. Fix Broken/Malformed Arrows
      line = line.replace(/\s*-->\s*/g, ' --> ');
      line = line.replace(/\s*->\s*/g, ' -> ');
      line = line.replace(/\s*-\.->\s*/g, ' -.-> ');
      line = line.replace(/\s*==>\s*/g, ' ==> ');
      line = line.replace(/--\|/g, '|'); // Fix --|Text|
      line = line.replace(/\|-->/g, '| -->');
      
      // 3. SANITIZATION HELPER
      // Aggressively cleans text to be safe inside a double-quoted string
      const sanitize = (text: string) => {
        // Remove outer quotes if present to avoid double quoting
        let clean = text.replace(/^["']|["']$/g, '');
        // Escape internal quotes
        clean = clean.replace(/"/g, "'");
        // Replace brackets/parens that break mermaid parser if they appear inside labels
        // We replace them with space to preserve readability without breaking syntax
        clean = clean.replace(/[\[\]\(\)\{\}]/g, ' '); 
        return `"${clean.trim()}"`;
      };

      // 4. NODE PATTERN MATCHING & REPLACEMENT
      // Convert any node shape (round, square, curly, stadium) to a standard sanitized format.
      // Use lazy matching (.+?) to handle multiple nodes on one line (e.g., A[x] --> B[y])

      // Fix Round Brackets: ID(...) or ID([...]) (Stadium treated as Round for safety)
      line = line.replace(/(\b\w+)\s*\((.+?)\)/g, (m, id, content) => {
          return `${id}(${sanitize(content)})`; 
      });

      // Fix Square Brackets: ID[...]
      line = line.replace(/(\b\w+)\s*\[(.+?)\]/g, (m, id, content) => {
          return `${id}[${sanitize(content)}]`;
      });

      // Fix Curly Brackets: ID{...}
      line = line.replace(/(\b\w+)\s*\{(.+?)\}/g, (m, id, content) => {
          return `${id}{${sanitize(content)}}`;
      });

      // 5. INJECT MISSING ARROWS
      // Detects adjacent nodes missing an arrow, e.g., "A[Label] B[Label]"
      // Pattern: Closing bracket/paren -> whitespace -> Start of next node ID
      line = line.replace(/([\)|\]|\}])\s+(?=[a-zA-Z0-9_]+[\(\[\{])/g, '$1 --> ');

      // 6. CLEANUP & VALIDATION
      // Fix double quotes
      line = line.replace(/""/g, '"');
      
      // Remove trailing garbage parens/brackets that might remain from bad regex matches
      line = line.replace(/(")\s*[\)\]\}]+$/g, '$1');

      // Filter out lines that are purely text (hallucinations) and not valid graph syntax
      // Must contain an arrow, or be a node definition, or a keyword
      const validSyntax = /(-->|->|==>|-\.->|subgraph|end|classDef|click|style|graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|\[|\(|\{)/;
      
      if (!validSyntax.test(line)) {
           // Comment out invalid lines instead of deleting, to preserve context if needed
           line = `%% Ignored text: ${line}`;
      }

      fixedLines.push(line);
    }

    return "```mermaid\n" + fixedLines.join('\n') + "\n```";
  });
};

// General utility to clean "infinite dashes" in tables and other artifacts
export const cleanTableSyntax = (text: string): string => {
  let cleaned = text.replace(/-{4,}/g, '---');
  // Remove common AI chatter before code blocks
  cleaned = cleaned.replace(/Here is the (mermaid )?diagram(:)?/gi, '');
  return cleaned;
};

export const processGeneratedNote = (rawText: string): string => {
  let processed = fixMermaidSyntax(rawText);
  processed = cleanTableSyntax(processed);
  processed = convertTagsToObsidian(processed);
  return processed;
};
