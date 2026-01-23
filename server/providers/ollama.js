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
}