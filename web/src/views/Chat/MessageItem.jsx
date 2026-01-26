// web/src/views/Chat/MessageItem.jsx

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const MessageItem = ({ role, content, isLast, onRegenerate, isLoading }) => {
  const isUser = role === 'user';

  const [copied, setCopied] = useState(false); // 复制反馈状态

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      // 2秒后重置状态
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-8 group relative`}>
      <div className={`max-w-[85%] px-4 py-3 rounded-2xl shadow-sm ${
        isUser 
          ? 'bg-blue-600 text-white rounded-tr-none' 
          : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'
      }`}>
        {/* 使用 prose 类自动美化 Markdown 元素 */}
        <article className={`prose prose-sm md:prose-base max-w-none ${isUser ? 'prose-invert' : ''}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // 自定义代码块渲染
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <div className="relative group/code my-2">
                    <div className="absolute right-2 top-2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      {match[1]}
                    </div>
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      className="rounded-lg !m-0"
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <code className="bg-gray-200 px-1 rounded text-red-500" {...props}>
                    {children}
                  </code>
                );
              }
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
        
        {/* 消息操作按钮区域 (放在气泡下方) */}
        {!isUser && (
          <div className="absolute -bottom-7 left-0 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            
            {/* 1. 复制按钮 (所有 AI 消息都显示) */}
            <button 
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all bg-white border border-gray-100 shadow-sm"
              title="复制全文"
            >
              {copied ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-green-600">已复制</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3" />
                  </svg>
                  <span>复制全文</span>
                </>
              )}
            </button>

            {/* 2. 重新生成按钮 (仅最后一条显示) */}
            {isLast && !isLoading && (
              <button 
                onClick={onRegenerate}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all bg-white border border-gray-100 shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                重新生成
              </button>
            )}
          </div>
        )}

      </div>
      
    </div>
  );
};

export default MessageItem;