import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runOllama } from './ollama.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

export async function runTool(toolId, inputs) {
  // 1. 读取 Tool 定义
  const toolPath = path.join(ROOT, 'tools', `${toolId}.json`);
  if (!fs.existsSync(toolPath)) {
    throw new Error(`Tool not found: ${toolId}`);
  }

  const tool = JSON.parse(fs.readFileSync(toolPath, 'utf-8'));

  // 2. 校验必填输入
  for (const key in tool.inputs) {
    const def = tool.inputs[key];
    if (def.required && !inputs[key]) {
      throw new Error(`Missing input: ${key}`);
    }
  }

  // 3. 解析 prompt 并读取
  let promptFile = tool.prompt;
  for (const key in inputs) {
    // 允许在 prompt 文件名中使用变量，如 brief.{platform}.md
    promptFile = promptFile.replace(`{${key}}`, inputs[key]);
  }

  const promptPath = path.join(ROOT, 'prompts', promptFile);
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptFile}`);
  }
  const systemPrompt = fs.readFileSync(promptPath, 'utf-8');

  // 4. 拼最终 prompt
  let userContent = '';
  if (inputs.question) userContent += `问题：\n${inputs.question}\n\n`;
  if (inputs.file) userContent += `素材：\n${inputs.file}\n\n`;

  const finalPrompt = `${systemPrompt}\n\n${userContent}`.trim();

  // 5. 调模型
  const result = await runOllama({
    model: tool.model,
    prompt: finalPrompt,
    temperature: tool.temperature
  });

  let parsedResult = result;

  // JSON 解析处理
  if (tool.outputType === 'json') {
    try {
      const cleanJson = result.replace(/```json|```/g, '').trim();
      parsedResult = JSON.parse(cleanJson);
    } catch (e) {
      throw new Error('Model output is not valid JSON');
    }
  }

  // --- 自动提取关键词逻辑 ---
  let keywords = [];
  // 如果当前运行的是 brief 且不是递归调用，则触发关键词提取
  if (toolId === 'brief' && !inputs._isRecursive) {
    try {
      const keywordData = await runTool('brief.keywords', {
        question: inputs.question,
        // 确保 file 传入的是字符串。如果 parsedResult 是对象，取其 brief 字段
        file: typeof parsedResult === 'string' ? parsedResult : (parsedResult.brief || JSON.stringify(parsedResult)),
        _isRecursive: true
      });
      
      // --- 递归结果在 keywordData.result 中 ---
      const finalKeywords = keywordData.result; 

      if (Array.isArray(finalKeywords)) {
        keywords = finalKeywords;
      } else if (finalKeywords && typeof finalKeywords === 'object' && finalKeywords.keywords) {
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
    keywords: keywords // 合并到结果中返回
  };
}