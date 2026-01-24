// server/providers/ollama.js
import fetch from 'node-fetch';

export class OllamaProvider {
  constructor(config) {
    // 默认地址 http://127.0.0.1:11434
    this.baseUrl = config.baseUrl || 'http://127.0.0.1:11434';
  }

  /**
   * 统一的对话接口
   * @param {string} model 模型名称 (如 llama3)
   * @param {Array} messages 消息数组 [{role: 'user', content: '...'}]
   */
  async chat(model, messages) {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: messages, // 结构：[{role: "user", content: "..."}]
        stream: false,
        options: {
          temperature: 0.7
        }
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Ollama request failed: ${errorText}`);
    }

    const data = await res.json();
    // Ollama /api/chat 返回的是 { message: { role: 'assistant', content: '...' } }
    return {
      text: data.message.content,
      actualModel: `Ollama: ${model}` // 标记是本地模型
    };
  }

  /**
   * 核心：流式对话接口
   * 使用 Async Generator 实现
   */
  async *chatStream(model, messages) {
    const endpoint = `${this.baseUrl}/api/chat`; 
    console.log('📡 Sending request to Ollama:', endpoint, 'with model:', model);
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: true,
        options: { temperature: 0.7 }
      })
    });

    if (!res.ok) {
      const errorDetail = await res.text().catch(() => '');
      throw new Error(`Ollama stream failed: ${res.statusText} ${errorDetail}`);
    }

    // 重点：处理 Node.js 的流
    for await (const chunk of res.body) {
      const text = chunk.toString();
      // Ollama 在 stream 模式下每行返回一个完整的 JSON 对象
      const lines = text.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            yield json.message.content; // 将文字内容传给前端
          }
          if (json.done) return;
        } catch (e) {
          // 如果某一行 JSON 解析失败（通常是数据还没传输完），记录一下但不中断
          console.warn('解析分片 JSON 失败:', e.message);
        }
      }
    }
  }

}