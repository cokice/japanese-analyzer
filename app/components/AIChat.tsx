'use client';

import { useEffect, useRef, useState } from 'react';
import { streamChat, ChatMessage as APIMessage } from '../services/api';
import type { AIProvider } from '../services/api';
import { Icon } from './Icons';
import { AutoAnimateHeight } from '@/components/ui/auto-animate-height';
import { FlowAnimatedMarkdown } from '@/components/ui/flow-animated-markdown';
import {
  MorphingPopover,
  MorphingPopoverContent,
  MorphingPopoverTrigger,
} from '@/components/ui/morphing-popover';
import { escapeHtmlForMarkdown, preserveLineBreaksForMarkdown } from '../utils/markdown';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatProps {
  userApiKey?: string;
  userApiUrl?: string;
  aiProvider: AIProvider;
  currentSentence?: string;
}

export default function AIChat({ userApiKey, userApiUrl, aiProvider, currentSentence }: AIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExpanded]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeContent = currentSentence
        ? `你好！我是你的日语学习助手。我看到你正在分析这个句子：「${currentSentence}」。你可以问我关于这个句子的语法、词汇，或者任何其他日语相关问题。`
        : '你好！我是你的日语学习助手。你可以问我关于日语语法、词汇、文化等任何问题。';

      setMessages([{
        id: Date.now().toString(),
        role: 'assistant',
        content: welcomeContent
      }]);
    }
  }, [isOpen, messages.length, currentSentence]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    const tempAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: ''
    };

    setMessages((prev) => [...prev, tempAssistantMessage]);

    try {
      const apiMessages: APIMessage[] = messages
        .filter((msg) => msg.id !== userMessage.id)
        .map((msg) => ({
          role: msg.role,
          content: msg.content
        }));

      if (currentSentence) {
        const hasContextAlready = messages.some((msg) =>
          msg.content.includes(currentSentence) ||
          msg.content.includes('我正在分析这个日语句子')
        );

        if (!hasContextAlready) {
          apiMessages.push({
            role: 'user',
            content: `请注意：我正在分析这个日语句子：「${currentSentence}」。请在后续回答中结合这个句子的语境来解释相关的日语问题。`
          });
        }
      }

      apiMessages.push({
        role: 'user',
        content: userMessage.content
      });

      streamChat(
        apiMessages,
        (chunk, isDone) => {
          setMessages((prev) => prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: chunk }
              : msg
          ));

          if (isDone) {
            setIsLoading(false);
          }
        },
        (error) => {
          console.error('Chat error:', error);
          setMessages((prev) => prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: `抱歉，聊天时出现错误：${error.message}` }
              : msg
          ));
          setIsLoading(false);
        },
        userApiKey,
        userApiUrl,
        aiProvider
      );
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => prev.map((msg) =>
        msg.id === assistantMessageId
          ? { ...msg, content: `抱歉，聊天时出现错误：${error instanceof Error ? error.message : '未知错误'}` }
          : msg
      ));
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handlePopoverOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const openExpanded = () => {
    setIsOpen(false);
    setIsExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const closeChat = () => {
    setIsOpen(false);
    setIsExpanded(false);
  };

  const renderChatPanel = (expanded: boolean) => (
    <>
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
          {Icon.chat}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-sm font-semibold" style={{ color: 'var(--ink)' }}>AI 日语助手</h3>
          <p className="m-0 mt-0.5 truncate text-xs" style={{ color: 'var(--ink-3)' }}>
            {currentSentence ? '结合当前句子回答' : '语法、词汇和学习问题'}
          </p>
        </div>
        <button
          onClick={expanded ? () => {
            setIsExpanded(false);
            setIsOpen(true);
          } : openExpanded}
          className="nd-icon-btn"
          title={expanded ? '收缩窗口' : '展开窗口'}
          type="button"
        >
          {expanded ? Icon.compress : Icon.expand}
        </button>
        <button
          onClick={closeChat}
          className="nd-icon-btn"
          title="关闭聊天"
          type="button"
        >
          {Icon.xSm}
        </button>
      </div>

      <div className={`flex-1 space-y-3 overflow-y-auto ${expanded ? 'p-6' : 'p-4'}`}>
        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`${expanded ? 'max-w-[72%]' : 'max-w-[82%]'} rounded-2xl px-4 py-3 text-sm leading-6`}
                style={{
                  background: isUser ? 'var(--primary)' : 'var(--bg)',
                  color: isUser ? '#fff' : 'var(--ink-2)',
                  border: isUser ? '1px solid var(--primary)' : '1px solid var(--line)',
                  boxShadow: '0 1px 2px rgba(20,10,40,.03)',
                }}
              >
                <AutoAnimateHeight duration={300}>
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  ) : (
                    <div className="flow-markdown ai-chat-markdown max-w-none">
                      <FlowAnimatedMarkdown
                        content={preserveLineBreaksForMarkdown(escapeHtmlForMarkdown(message.content))}
                        animation="fadeIn"
                        sep="word"
                        animationDuration="0.35s"
                        animationTimingFunction="ease-out"
                      />
                      {isLoading && message.content && (
                        <span className="ml-1 inline-block h-4 w-1 animate-pulse rounded-full" style={{ background: 'var(--primary)' }} />
                      )}
                    </div>
                  )}
                </AutoAnimateHeight>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      <div className={`border-t ${expanded ? 'p-5' : 'p-4'}`} style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的日语问题..."
            className="nd-input min-h-[42px] flex-1 resize-none"
            rows={expanded ? 3 : 1}
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="nd-primary-btn min-h-[42px] px-4"
            type="button"
            title="发送"
          >
            {Icon.send}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {isExpanded && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(20,10,40,.45)' }}
          onClick={() => setIsExpanded(false)}
        />
      )}

      {isExpanded && (
        <div
          className="fixed z-50 flex flex-col overflow-hidden rounded-2xl transition-all duration-300"
          style={{
            top: '50%',
            left: '50%',
            width: 'min(860px, calc(100vw - 32px))',
            height: 'min(720px, calc(100vh - 48px))',
            transform: 'translate(-50%, -50%)',
            background: 'var(--bg-2)',
            border: '1px solid var(--line)',
            boxShadow: '0 20px 50px -10px rgba(40,10,80,.25), 0 2px 8px rgba(20,10,40,.06)',
          }}
        >
          {renderChatPanel(true)}
        </div>
      )}

      {!isExpanded && (
        <MorphingPopover
          open={isOpen}
          onOpenChange={handlePopoverOpenChange}
          className="fixed bottom-7 right-7 z-[9999]"
        >
          <MorphingPopoverTrigger
            className="nd-fab morphing-chat-trigger"
            title="AI 日语助手"
            type="button"
          >
            {Icon.chat}
          </MorphingPopoverTrigger>
          <MorphingPopoverContent className="bottom-0 right-0 flex h-[520px] w-[min(390px,calc(100vw-32px))] max-w-[calc(100vw-32px)] flex-col p-0">
            {renderChatPanel(false)}
          </MorphingPopoverContent>
        </MorphingPopover>
      )}
    </>
  );
}
