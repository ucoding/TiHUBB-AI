// server/tool-runner.js

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

  // 3. 解析 prompt 文件名（支持 brief.{platform}.md）
  let promptFile = tool.prompt;
  for (const key in inputs) {
    promptFile = promptFile.replace(`{${key}}`, inputs[key]);
  }

  const promptPath = path.join(ROOT, 'prompts', promptFile);
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptFile}`);
  }

  const systemPrompt = fs.readFileSync(promptPath, 'utf-8');

  // 4. 拼最终 prompt
  let userContent = '';
  if (inputs.question) {
    userContent += `问题：\n${inputs.question}\n\n`;
  }
  if (inputs.file) {
    userContent += `素材：\n${inputs.file}\n\n`;
  }

  const finalPrompt = `
${systemPrompt}

${userContent}
`.trim();

  // 5. 调模型
  const result = await runOllama({
    model: tool.model,
    prompt: finalPrompt,
    temperature: tool.temperature
  });

  return result;
}
