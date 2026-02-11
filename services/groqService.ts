
import Groq from 'groq-sdk';
import { GenerationConfig } from '../types';
import { getStrictPrompt } from '../utils/prompts';
import { processGeneratedNote } from '../utils/formatter';

// Helper to get SDK instance
const getGroqClient = (apiKey: string) => {
  return new Groq({ 
    apiKey: apiKey,
    dangerouslyAllowBrowser: true // Required for client-side use
  });
};

export const getAvailableGroqModels = async (config: GenerationConfig) => {
  const apiKey = config.groqApiKey || process.env.GROQ_API_KEY;
  if (!apiKey) return [];

  try {
    const groq = getGroqClient(apiKey);
    const list = await groq.models.list();
    return list.data;
  } catch (error) {
    console.error("Failed to fetch Groq models:", error);
    return [];
  }
};

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

  onProgress("Initializing Groq SDK...");
  const modelName = config.model;
  const groq = getGroqClient(apiKey);

  onProgress(`Connecting to Groq Cloud (${modelName})...`);

  try {
    const textPrompt = getStrictPrompt(topic, structure, config.mode);
    
    // Construct the messages payload with strict system instructions
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

    const completion = await groq.chat.completions.create({
      messages: messages as any,
      model: modelName,
      temperature: config.temperature,
      // Groq currently caps output tokens at 8192 for most models
      max_completion_tokens: 8192, 
      top_p: 1,
      stream: false
    });

    const rawText = completion.choices[0]?.message?.content;

    if (!rawText) {
      throw new Error("Received empty response from Groq AI.");
    }

    onProgress("Formatting & Cleaning Mermaid syntax...");
    const finalContent = processGeneratedNote(rawText);

    return finalContent;

  } catch (error: any) {
    console.error("Groq SDK Error:", error);
    if (error.message?.includes("429")) {
      throw new Error("Groq Rate Limit Exceeded (429). Please wait or check your plan.");
    }
    // Handle error where model doesn't exist (e.g. slight slug mismatch)
    if (error.message?.includes("model")) {
        throw new Error(`Model Error: ${error.message}`);
    }
    throw error;
  }
};
