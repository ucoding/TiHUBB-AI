// web/src/App.jsx

import { useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  SparklesIcon, 
  ChatBubbleLeftRightIcon,
  ClipboardDocumentIcon, 
  ClipboardDocumentCheckIcon
} from '@heroicons/react/24/outline';

// 从环境变量读取 API 基础 URL
const API_BASE = import.meta.env.VITE_API_BASE;

export default function App() {
  const [question, setQuestion] = useState('');
  const [platform, setPlatform] = useState('zhihu');
  const [result, setResult] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const contentRef = useRef(null);
  const [copied, setCopied] = useState(false);

  function stripMarkdown(md) {
    return md
      .replace(/(\*\*|__)(.*?)\1/g, '$2')  // 粗体
      .replace(/(\*|_)(.*?)\1/g, '$2')     // 斜体
      .replace(/`{1,3}.*?`{1,3}/g, '')     // 代码块
      .replace(/!\[.*?\]\(.*?\)/g, '')     // 图片
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // 链接
      .replace(/#+\s?/g, '')               // 标题
      .replace(/^\s*>\s?/gm, '')           // 引用
      .replace(/[-*+]\s+/g, '')            // 列表符号
      .replace(/\n{2,}/g, '\n')            // 多空行合并
      .trim();
  }

  const handleCopy = useCallback(async () => {
    if (!result || !contentRef.current) return;

    try {
      const rawHtml = contentRef.current.innerHTML;
      const plainText = contentRef.current.innerText;
      // 构造带基础样式的 HTML（为了让 Word/飞书等识别格式）
      const htmlContent = `
        <html>
          <body>
            <style>
              h1 { font-size: 1.5em; font-weight: bold; margin-bottom: 1em; }
              p { margin-bottom: 0.8em; line-height: 1.6; }
              strong { font-weight: bold; }
              ol, ul { padding-left: 1.5em; margin-bottom: 1em; }
              li { margin-bottom: 0.4em; }
            </style>
            ${rawHtml}
          </body>
        </html>
      `;

      // 检查浏览器是否支持最新的剪贴板 API
      if (navigator.clipboard && window.ClipboardItem) {
        const data = [
          new ClipboardItem({
            "text/plain": new Blob([plainText], { type: "text/plain" }),
            "text/html": new Blob([htmlContent], { type: "text/html" }),
          }),
        ];

        await navigator.clipboard.write(data);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // 如果不支持新 API，回退到旧的纯文本复制
        fallbackCopy(result);
      }
    } catch (err) {
      console.error('富文本复制失败:', err);
      fallbackCopy(result); // 出错时尝试纯文本复制
    }
  }, [result]);

  function fallbackCopy(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('复制失败', e);
    }
  }

  async function runTool() {
    setLoading(true);
    setResult('');
    setError(null);

    try {
      const res = await fetch('http://localhost:3000/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'brief', inputs: { question, platform } }),
      });

      const data = await res.json();
      if (res.ok && typeof data.output === 'string') {
        const briefMarkdown = data.output.trim();
        const briefText = stripMarkdown(briefMarkdown); // 去掉 Markdown

        setResult(briefMarkdown);
        setAiResult({
          platformLabel: platformConfigs.find(p => p.id === platform)?.label || platform.toUpperCase(),
          question,
          brief: briefText,
          summary: briefText.slice(0, 120),
          status: 'publish', 
        });
      } else {
        setError(data.error || '后端返回了错误');
      }
    } catch (e) {
      setError('网络连接失败，请检查后端服务是否启动');
    } finally {
      setLoading(false);
    }
  }

  const platformConfigs = [
    {
      id: 'zhihu',
      label: '知乎',
      active: 'bg-blue-600 text-white',
      inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
    },
    {
      id: 'x',
      label: 'X / Twitter',
      active: 'bg-blue-400 text-white',
      inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
    },
    {
      id: 'xhs',
      label: '小红书',
      active: 'bg-red-500 text-white',
      inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
    },
  ];

  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  
  async function handlePublish() {
    if (!aiResult) {
      alert('请先生成内容');
      return;
    }
    setPublishing(true);
    setPublishResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/publish-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiResult)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setPublishResult(data.result);
    } catch (err) {
      alert('推送失败：' + err.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200 mb-2">
          <SparklesIcon className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          TiHUBB 内容简报生成器
        </h1>
        <p className="text-lg text-slate-500">
          拒绝废话，一键生成高质量、有观点的社交媒体短文。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full min-h-[400px]">
          <div className="flex items-center space-x-2 mb-4">
            <ChatBubbleLeftRightIcon className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-slate-900">输入话题</h2>
          </div>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="例如：为什么现在的年轻人不愿意生孩子？"
            className="w-full flex-1 p-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-transparent transition-all resize-none text-slate-700 placeholder:text-slate-400 text-base leading-relaxed mb-6"
          />
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {platformConfigs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={`px-4 py-2 rounded font-medium transition-all duration-200 ${
                    platform === p.id
                      ? `${p.active} shadow-md scale-105`
                      : `${p.inactive}`
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              onClick={runTool}
              disabled={loading}
              className={`w-full py-3.5 px-6 rounded-xl text-white font-semibold text-lg shadow-lg transition-all duration-200 flex items-center justify-center space-x-2
                ${loading || !question.trim() 
                  ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                  : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-200 hover:-translate-y-0.5 active:translate-y-0'
                }`}
            >
              {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    生成中...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-5 w-5" />
                    <span>立即生成</span>
                  </>
                )}
            </button>
          </div>
        </div>
        
        {/* Output Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full min-h-[400px] relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              生成结果
            </h2>
            {result && (
                <button
                  onClick={handleCopy}
                  className={`flex items-center space-x-1 text-sm font-medium transition-colors ${
                    copied ? 'text-green-600' : 'text-slate-500 hover:text-indigo-600'
                  }`}
                >
                  {copied ? (
                    <>
                      <ClipboardDocumentCheckIcon className="h-4 w-4" />
                      <span>已复制</span>
                    </>
                  ) : (
                    <>
                      <ClipboardDocumentIcon className="h-4 w-4" />
                      <span>一键复制</span>
                    </>
                  )}
                </button>
              )}
          </div>
        
          <div className="flex-1 rounded-xl border border-slate-100 p-4 overflow-y-auto relative">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                <div className="h-4 bg-slate-200 rounded w-2/3"></div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <div className="text-red-500 mb-2">⚠️</div>
                  <p className="text-red-600 font-medium">{error}</p>
                  <p className="text-sm text-slate-500 mt-1">请检查网络或稍后重试</p>
              </div>
            ) : result ? (
                <div ref={contentRef} className="prose prose-sm max-w-full">
                  <ReactMarkdown>{result}</ReactMarkdown>
                </div>
            ) : (
              <div className="h-full"></div>
            )}
          </div>

          {/* Publish Brief */}
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="mt-4 px-4 py-2 rounded-lg bg-green-600 text-white disabled:opacity-50"
          >
            {publishing ? '推送中...' : '推送到 WordPress'}
          </button>
          {publishResult && (
            <div className="mt-2 text-sm text-green-700">
              已推送成功：
              <a
                href={publishResult.link}
                target="_blank"
                className="underline ml-1"
              >
                查看草稿
              </a>
            </div>
          )}


          {/* Character count or extra info could go here */}
          {result && (
            <div className="mt-4 flex justify-end">
              <span className="text-xs text-slate-400">
                {result.length} 字
              </span>
            </div>
          )}
        </div>  
        
      </div>
      
    </div>
  );
}
