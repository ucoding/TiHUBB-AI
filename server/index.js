// server/index.js # 启动 HTTP 服务

import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' }); // 加载本地环境变量
import express from 'express';
import { runTool } from './tool-runner.js';
import cors from "cors";
import { publishBrief } from './brief-publisher.js';

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

// 监听端口，启动服务（放最后）
app.listen(3000, '0.0.0.0', () => {
  console.log('✅ AI Tool Server running at http://0.0.0.0:3000');
});

