// server/providers/openai.js
export class OpenAIProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
  }

  async chat(model, messages) {
    // 自动修正 Google 兼容模式下的路径拼接问题
    // 如果 baseUrl 已经包含 v1beta，我们确保不再重复拼接错误的 v1
    const url = this.baseUrl.endsWith('/') ? `${this.baseUrl}chat/completions` : `${this.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`[OpenAI Error] Status: ${response.status}`, responseText);
      // 检查是否是因为 404，给出更明确的提示
      if (responseText.includes("not found")) {
        throw new Error(`模型无法访问。请确认你的项目已开启 Generative Language API 并且 IP 处于支持区域。`);
      }
      throw new Error(`API 请求失败: ${response.status}`);
    }

    try {
      const data = JSON.parse(responseText);
      return data.choices[0].message.content;
    } catch (e) {
      throw new Error("解析返回数据失败：" + e.message);
    }
  }
}