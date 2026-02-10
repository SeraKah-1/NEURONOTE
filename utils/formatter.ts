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
    'INFO': { type: 'info', icon: 'ℹ️' }
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
  // Regex to find mermaid blocks
  const mermaidBlockPattern = /```mermaid([\s\S]*?)```/g;

  return markdownText.replace(mermaidBlockPattern, (match, rawContent) => {
    const lines = rawContent.split('\n');
    const fixedLines: string[] = [];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line.startsWith('%%')) continue;
      
      // 0. Fix escaped quotes that sometimes appear (e.g. \"text\") and escaped brackets
      line = line.replace(/\\"/g, '"');
      line = line.replace(/\\\[/g, '[').replace(/\\\]/g, ']');

      // 1. Remove garbage prefixes (e.g. "1. A --> B")
      line = line.replace(/^[\d\.\-\*\s]+(?=\w)/, '');

      // 2. Fix broken arrows and hallucinated arrow endings
      // Fix -->|Text|> pattern (common AI hallucination)
      line = line.replace(/-->\s*\|([^|]+)\|>+/g, '-->|$1|');
      // Fix --|Text|--> (sometimes appears)
      line = line.replace(/--\|([^|]+)\|-->/g, '-->|$1|');
      
      // Standardize arrows
      line = line.replace(/--\s+>/g, '-->');
      line = line.replace(/-\s+>/g, '->');
      line = line.replace(/\s+-->/g, ' -->'); 
      line = line.replace(/-->\s+/g, '--> ');
      
      // Fix generic |> garbage at end of arrows if not class diagram inheritance
      if (!line.includes('<|')) { 
         line = line.replace(/\|>/g, '|'); 
      }

      // 3. Node Label Sanitization
      // Helper to quote content if not quoted
      const ensureQuoted = (id: string, content: string, wrapper: [string, string]) => {
         // If already quoted properly, return as is
         if (/^".*"$/.test(content)) return `${id}${wrapper[0]}${content}${wrapper[1]}`;
         
         // Escape internal quotes
         const safe = content.replace(/"/g, "'");
         return `${id}${wrapper[0]}"${safe}"${wrapper[1]}`;
      };

      // Process [ ... ]
      line = line.replace(/([\w-]+)\s*\[(.*?)\]/g, (m, id, c) => ensureQuoted(id, c, ['[', ']']));
      
      // Process ( ... )
      line = line.replace(/([\w-]+)\s*\((.*?)\)/g, (m, id, c) => ensureQuoted(id, c, ['(', ')']));
      
      // Process { ... }
      line = line.replace(/([\w-]+)\s*\{(.*?)\}/g, (m, id, c) => ensureQuoted(id, c, ['{', '}']));
      
      // Fix double quotes issues if any (e.g. ""text"")
      line = line.replace(/""/g, '"');

      fixedLines.push(line);
    }

    if (fixedLines.length > 0) {
      const firstLine = fixedLines[0];
      const isGraphDecl = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie)/.test(firstLine);
      if (!isGraphDecl) {
        fixedLines.unshift('graph TD');
      }
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