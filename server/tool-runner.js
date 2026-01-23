// server/tool-runner.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// 1. 引入工厂函数
import { createProvider } from './providers/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

export async function runTool(toolId, inputs) {
  // --- 1. 读取 Tool 定义 ---
  const toolPath = path.join(ROOT, 'tools', `${toolId}.json`);
  if (!fs.existsSync(toolPath)) {
    throw new Error(`Tool not found: ${toolId}`);
  }
  const tool = JSON.parse(fs.readFileSync(toolPath, 'utf-8'));

  // --- 2. 校验必填输入 ---
  for (const key in tool.inputs) {
    const def = tool.inputs[key];
    if (def.required && !inputs[key]) {
      throw new Error(`Missing input: ${key}`);
    }
  }

  // --- 3. 解析并读取 Prompt 模板 ---
  let promptFile = tool.prompt;
  for (const key in inputs) {
    promptFile = promptFile.replace(`{${key}}`, inputs[key]);
  }

  const promptPath = path.join(ROOT, 'prompts', promptFile);
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptFile}`);
  }
  const systemPrompt = fs.readFileSync(promptPath, 'utf-8');

  // --- 4. 构建消息数组 (适配不同模型) ---
  let userContent = '';
  if (inputs.question) userContent += `问题：\n${inputs.question}\n\n`;
  if (inputs.file) userContent += `素材：\n${inputs.file}\n\n`;

  // 构造标准的 Chat Messages 格式
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent.trim() || '请根据要求处理' }
  ];

  // --- 5. 确定 Provider 类型 ---
  // 优先级：前端输入 > tools/*.json 默认 > 环境变量 > 强制兜底 'ollama'
  const providerType = (inputs.provider || tool.defaultProvider || process.env.AI_PROVIDER || 'ollama').toLowerCase();

  // --- 5.1 获取 Provider 配置 ---
  const prefix = providerType.toUpperCase();
  const providerConfig = {
    // Ollama 默认地址兜底：http://127.0.0.1:11434
    baseUrl: process.env[`${prefix}_BASE_URL`] || (providerType === 'ollama' ? 'http://127.0.0.1:11434' : undefined),
    apiKey: process.env[`${prefix}_API_KEY`],
  };

  const provider = createProvider(providerType, providerConfig);

  // --- 5.5 动态决定模型名称 (核心优化点) ---
  let activeModel;

  if (tool.models && tool.models[providerType]) {
    // 1. 优先使用 tool.json 中为该 Provider 指定的模型 (如你配置的 gemma3:12b)
    activeModel = tool.models[providerType];
  } else {
    // 2. 其次使用环境变量中定义的该 Provider 默认模型 (如 GEMINI_MODEL)
    // 3. 最后使用硬编码的行业标准模型作为兜底
    const defaultModel = providerType === 'ollama' ? 'gemma3:12b' : 
                        providerType === 'gemini' ? 'gemini-1.5-flash' : 'deepseek-chat';
    activeModel = process.env[`${prefix}_MODEL`] || defaultModel;
  }

  console.log(`[🚀 AI Run] Provider: ${providerType} | Model: ${activeModel}`);

  // --- 6. 执行调用 ---
  // 注意：这里必须传入计算后的 activeModel，而不是 tool.model
  let responseData;
  try {
    // 这里的 provider.chat 现在返回的是 { text: "...", actualModel: "..." }
    responseData = await provider.chat(activeModel, messages);
  } catch (error) {
    // 如果不是 ollama，且云端出错了，尝试最后降级到本地救场
    if (providerType !== 'ollama') {
      console.warn(`[Fallback] ${providerType} 彻底失败，正在尝试本地 Ollama 救场...`);
      const localProvider = createProvider('ollama', { 
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434' 
      });
      // 降级调用本地 gemma3
      responseData = await localProvider.chat('gemma3:12b', messages);
    } else {
      throw error;
    }
  }

  // 从响应中解构出真正的文本内容和最终生效的模型名
  const result = responseData.text;
  const actualModel = responseData.actualModel;
  
  let parsedResult = result;

  // --- 7. JSON 解析处理 ---
  if (tool.outputType === 'json') {
    try {
      const cleanJson = result.replace(/```json|```/g, '').trim();
      parsedResult = JSON.parse(cleanJson);
    } catch (e) {
      console.error('JSON解析失败，原始输出:', result);
      throw new Error('模型输出格式非标准 JSON，请重试');
    }
  }

  // --- 8. 自动提取关键词逻辑 (递归调用) ---
  let keywords = [];
  if (toolId === 'brief' && !inputs._isRecursive) {
    try {
      const keywordData = await runTool('brief.keywords', {
        question: inputs.question,
        file: typeof parsedResult === 'string' ? parsedResult : (parsedResult.brief || JSON.stringify(parsedResult)),
        _isRecursive: true,
        // 这样如果你前端选了 ollama，子任务也会强制用 ollama，不再乱跳 Gemini
      provider: providerType
      });
      
      const finalKeywords = keywordData.result; 
      if (Array.isArray(finalKeywords)) {
        keywords = finalKeywords;
      } else if (finalKeywords?.keywords) {
        keywords = finalKeywords.keywords;
      }
      
      console.log(`[Success] 提取到关键词:`, keywords);
    } catch (err) {
      console.error('关键词提取失败:', err.message);
      keywords = []; 
    }
  }

  return {
    toolId,
    outputType: tool.outputType || 'text',
    result: parsedResult,
    keywords: keywords,
    actualModel: actualModel // 标记实际使用的模型名称
  };
}