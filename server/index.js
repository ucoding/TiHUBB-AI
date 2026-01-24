// server/index.js # 启动 HTTP 服务

import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' }); // 加载本地环境变量
import express from 'express';
import { runTool } from './tool-runner.js';
import cors from "cors";
import { publishBrief } from './brief-publisher.js';
import multer from 'multer';
import fs from 'fs/promises';

// 运行 Express 服务器，AI 推理服务
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors());

app.post('/api/run', async (req, res) => {
  const { tool, inputs } = req.body;

  if (!tool || !inputs) {
    return res.status(400).json({ error: 'tool and inputs required' });
  }

  try {
    const output = await runTool(tool, inputs);
    res.json({ output });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 流式聊天接口：引入 Provider (通过 providers/index.js 统一获取)
import { OllamaProvider } from './providers/ollama.js'; 

app.post('/api/chat/stream', async (req, res) => {
  // 1. 安全解构：防止 req.body 为空导致崩溃
  const { messages, model = 'gemma3:12b' } = req.body || {};

  // 2. 校验前置：先检查数据是否存在，再进行切片操作
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  // 3. 上下文切片逻辑：
  // 注意：slice(-10) 会获取最后10个元素。
  const MAX_CONTEXT = 10;
  const contextMessages = messages.length > MAX_CONTEXT 
    ? messages.slice(-MAX_CONTEXT) 
    : messages;

  // 4. 组装最终消息：System Prompt + 过滤后的历史
  const systemPrompt = { 
    role: 'system', 
    content: '你是一个专业的本地AI助手，请用简洁专业的语言回答。' 
  };
  const finalMessages = [systemPrompt, ...contextMessages];

  // 5. 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // 禁用 Nginx 等代理的缓冲，确保流式输出即时到达
  res.setHeader('X-Accel-Buffering', 'no'); 

  const provider = new OllamaProvider({ baseUrl: 'http://127.0.0.1:11434' });

  try {
    const stream = provider.chatStream(model, finalMessages);
    
    for await (const chunk of stream) {
      // 6. 核心修复：SSE 必须以 data: 开头，并以 \n\n 结尾
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }
  } catch (err) {
    console.error('Streaming error:', err);
    // SSE 错误处理也要符合格式，否则前端 JSON.parse 会报错
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end(); 
  }
});

// 发布简报接口，内容入库WP
app.post('/api/publish-brief', async (req, res) => {
  try {
    const result = await publishBrief(req.body);
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});


// 处理文件读取接口
const upload = multer({ dest: 'uploads/' });
app.post('/api/upload-skill', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file.path;
    const content = await fs.readFile(filePath, 'utf-8');
    // 读取后删除临时文件
    await fs.unlink(filePath);
    
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: '文件读取失败' });
  }
});

// 监听端口，启动服务（放最后）
app.listen(3000, '0.0.0.0', () => {
  console.log('✅ AI Tool Server running at http://0.0.0.0:3000');
});
