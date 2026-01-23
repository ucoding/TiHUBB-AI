// server/providers/index.js
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';

export function createProvider(type, config) {
  switch (type.toLowerCase()) {
    case 'ollama':
      return new OllamaProvider({
        baseUrl: config.baseUrl || 'http://127.0.0.1:11434'
      });
    case 'openai':
    case 'deepseek':
      return new OpenAIProvider({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl
      });
    case 'gemini': 
      return new GeminiProvider({
        apiKey: config.apiKey
      });
    default:
      throw new Error(`不支持的模型类型: ${type}`);
  }
}