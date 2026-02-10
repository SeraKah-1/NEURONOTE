import { GenerationConfig } from '../types';
import { getStrictPrompt } from '../utils/prompts';
import { processGeneratedNote } from '../utils/formatter';

export const generateNoteContentGroq = async (
  config: GenerationConfig,
  topic: string,
  structure: string,
  onProgress: (status: string) => void
): Promise<string> => {
  
  const apiKey = config.groqApiKey || process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("Groq API Key is missing. Please enter it in Settings.");
  }

  onProgress("Checking configurations...");
  const modelName = config.model;

  onProgress(`Connecting to Groq Cloud (${modelName})...`);

  try {
    const textPrompt = getStrictPrompt(topic, structure, config.mode);
    
    // Construct the messages payload with strict system instructions
    // We explicitly tell it to ignore token limits in its reasoning (not technical limits)
    // to prevent it from self-censoring or summarizing.
    const messages = [
      {
        role: "system",
        content: `You are an advanced medical academic AI. 
        CRITICAL INSTRUCTIONS:
        1. Output strictly formatted markdown.
        2. DO NOT SUMMARIZE. Provide the most exhaustive, detailed explanation possible.
        3. IGNORE OUTPUT LENGTH LIMITS. Explain every concept fully.
        4. If a list has 20 items, list all 20. Do not truncate.
        5. For Mermaid diagrams: Use strict syntax. Quote all node labels (e.g. A["Label"]). Do not use brackets inside labels.`
      },
      {
        role: "user",
        content: textPrompt
      }
    ];

    onProgress("Synthesizing content (Groq LPU Engine - Max Output)...");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: messages,
        model: modelName,
        temperature: config.temperature,
        // Set to 32k (High limit) to allow "Overclocked" length. 
        // If the specific model (e.g. 8b) supports less, Groq will cap it automatically without erroring usually.
        max_completion_tokens: 32768, 
        top_p: 1,
        stream: false
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `Groq API Error: ${response.statusText}`);
    }

    const data = await response.json();
    const rawText = data.choices[0]?.message?.content;

    if (!rawText) {
      throw new Error("Received empty response from Groq AI.");
    }

    onProgress("Formatting & Cleaning Mermaid syntax...");
    const finalContent = processGeneratedNote(rawText);

    return finalContent;

  } catch (error: any) {
    console.error("Groq API Error:", error);
    if (error.message?.includes("429")) {
      throw new Error("Groq Rate Limit Exceeded (429). Please wait or check your plan.");
    }
    throw error;
  }
};