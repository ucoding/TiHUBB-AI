// server/tool-runner.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// 1. 引入工厂函数
import { createProvider } from './providers/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = __dirname;

export async function runTool(toolId, inputs) {
  // --- 1. 读取 Tool 定义 ---
  const toolPath = path.join(SERVER_ROOT, 'tools', `${toolId}.json`);

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

  const promptPath = path.join(SERVER_ROOT, 'prompts', promptFile);
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptFile}`);
  }
  const systemPrompt = fs.readFileSync(promptPath, 'utf-8'); // 读取 Prompt 时不使用缓存

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
      // 1. 兼容性寻找起始点：查找 [ 或 { 哪个先出现
      const braceIndex = result.indexOf('{');
      const bracketIndex = result.indexOf('[');
      
      let startIndex = -1;
      if (braceIndex === -1) startIndex = bracketIndex;
      else if (bracketIndex === -1) startIndex = braceIndex;
      else startIndex = Math.min(braceIndex, bracketIndex);

      if (startIndex === -1) throw new Error('No JSON start found');
      
      let cleanJson = result.substring(startIndex).trim();
      
      // 2. 截断修复逻辑优化
      const lastChar = cleanJson[cleanJson.length - 1];
      if (lastChar !== '}' && lastChar !== ']') {
        console.warn('[WP-AI] 检测到 JSON 可能截断，尝试自动修复...');
        
        const openBraces = (cleanJson.match(/\{/g) || []).length;
        const closeBraces = (cleanJson.match(/\}/g) || []).length;
        const openBrackets = (cleanJson.match(/\[/g) || []).length;
        const closeBrackets = (cleanJson.match(/\]/g) || []).length;

        // 这里的补全顺序很重要：先闭合引号，再闭合括号
        // 检查最后一段是否缺少引号（简单处理：如果最后不是符号且引号总数是奇数）
        const quoteCount = (cleanJson.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) cleanJson += '"';

        // 依次补齐
        cleanJson += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
        cleanJson += '}'.repeat(Math.max(0, openBraces - closeBraces));
      }

      // 3. 提取最终有效的 JSON 字符串（匹配最外层对应的闭合符）
      // 如果是数组开头，匹配到最后一个 ]；如果是对象开头，匹配到最后一个 }
      const isArray = cleanJson.startsWith('[');
      const lastValidIndex = isArray ? cleanJson.lastIndexOf(']') : cleanJson.lastIndexOf('}');
      
      if (lastValidIndex !== -1) {
        cleanJson = cleanJson.substring(0, lastValidIndex + 1);
      }

      parsedResult = JSON.parse(cleanJson);
      
    } catch (e) {
      console.error('JSON 修复亦失败，原始输出:', result);
      // 降级处理：如果是 Brief 模块（关键词提取），返回空数组而非报错对象
      parsedResult = Array.isArray(parsedResult) ? [] : {
        title: "生成不完整",
        sections: [{ heading: "解析失败", key_points: [result.substring(0, 50) + "..."] }]
      };
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

  // --- 9. 新增：SEO Meta 提取逻辑 (针对 Brief 任务) ---
  let seo = { seo_title: '', seo_keywords: '', seo_description: '' };
  
  // 仅在主任务是 brief 且非递归时执行
  if (toolId === 'brief' && !inputs._isRecursive) {
    try {
      console.log(`[🚀 SEO Extract] 正在为简报生成 SEO Meta...`);
      
      const seoData = await runTool('brief_seo', {
        question: inputs.question,
        // 将生成的简报内容作为素材传给 SEO 提取工具
        file: typeof parsedResult === 'string' ? parsedResult : JSON.stringify(parsedResult),
        _isRecursive: true,
        provider: providerType // 保持 Provider 一致性
      });

      // 确保提取到的结果符合 JSON 格式要求
      if (seoData.result && typeof seoData.result === 'object') {
        seo = {
          seo_title: seoData.result.seo_title || '',
          seo_keywords: seoData.result.seo_keywords || '',
          seo_description: seoData.result.seo_description || ''
        };
      }
      console.log(`[Success] SEO Meta 提取成功`);
    } catch (err) {
      console.error('SEO Meta 提取失败:', err.message);
      // 失败时保持空对象，不阻塞主流程
    }
  }

  return {
    toolId,
    outputType: tool.outputType || 'text',
    result: parsedResult,
    keywords: keywords,
    seo: seo,
    actualModel: actualModel // 标记实际使用的模型名称
  };
}