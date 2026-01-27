// web/src/utils/api.js 增加流式处理工具

const API_BASE = '/api'; // 根据你的实际后端地址调整

// 基础流式处理（用于 ChatMode）
export async function* fetchStream(url, body) {
  const response = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value);
  }
}

// 封装 Tool 运行器
export const api = {
  /**
   * 运行指定的 AI Tool
   * @param {string} toolId - tools/*.json 的文件名
   * @param {object} inputs - 传递给 Tool 的参数
   */
  async runTool(toolId, inputs) {
    const response = await fetch(`${API_BASE}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: toolId, inputs })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'AI 任务执行失败');
    }

    const data = await response.json();
    return data.output;
  },

  /**
   * 推送长文到 WordPress
   */
  async publishArticle({ title, content, excerpt, status = 'draft' }) {
    const response = await fetch(`${API_BASE}/publish-article`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, excerpt, status }),
    });
    if (!response.ok) throw new Error('发布到 WordPress 失败');
    return await response.json();
  }
};