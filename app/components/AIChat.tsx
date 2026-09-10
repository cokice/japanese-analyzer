'use client';

import { useEffect, useRef, useState } from 'react';
import { AssistantModalPrimitive, TextMessagePartProvider } from '@assistant-ui/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { streamChat, ChatMessage as APIMessage } from '../services/api';
import type { AIModelName, AIProvider } from '../services/api';
import { Icon } from './Icons';
import { AutoAnimateHeight } from '@/components/ui/auto-animate-height';
import { MarkdownText } from '@/components/ui/markdown-text';
import { createRequestMetrics } from '../utils/analytics';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatProps {
  userApiKey?: string;
  aiProvider: AIProvider;
  aiModel: AIModelName;
  currentSentence?: string;
}

export default function AIChat({ userApiKey, aiProvider, aiModel, currentSentence }: AIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const modalEase = [0.16, 1, 0.3, 1] as const;
  const panelInitial = shouldReduceMotion
    ? { opacity: 1 }
    : { opacity: 0, scale: 0.9, y: 8 };
  const panelAnimate = shouldReduceMotion
    ? { opacity: 1 }
    : { opacity: 1, scale: 1, y: 0 };
  const panelExit = shouldReduceMotion
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.9, y: 8 };
  const panelEnterTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: modalEase };
  const panelExitTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.15, ease: modalEase };
  const iconTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.15, ease: modalEase };

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
        ? '可以问我这句话的语法和用法。'
        : '想了解哪个词，或哪一句日语？';

      setMessages([{
        id: Date.now().toString(),
        role: 'assistant',
        content: welcomeContent
      }]);
    }
  }, [isOpen, messages.length, currentSentence]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    const metrics = createRequestMetrics('chat', aiProvider, aiModel, true);

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

      await streamChat(
        apiMessages,
        (chunk, isDone) => {
          if (chunk.trim()) metrics.firstResult();
          setMessages((prev) => prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: chunk }
              : msg
          ));

          if (isDone) {
            metrics.succeed();
            setIsLoading(false);
          }
        },
        (error) => {
          metrics.fail(error);
          console.error('Chat error:', error);
          setMessages((prev) => prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: `抱歉，聊天时出现错误：${error.message}` }
              : msg
          ));
          setIsLoading(false);
        },
        userApiKey,
        aiProvider,
        aiModel
      );
    } catch (error) {
      metrics.fail(error);
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
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
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
        className="chat-toolbar flex items-center gap-2 border-b px-4 py-3"
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
          className="dictionary-icon-btn"
          title={expanded ? '收缩窗口' : '展开窗口'}
          type="button"
        >
          {expanded ? Icon.compress : Icon.expand}
        </button>
        <button
          onClick={closeChat}
          className="dictionary-icon-btn"
          title="关闭聊天"
          type="button"
        >
          {Icon.xSm}
        </button>
      </div>

      <div className={`chat-messages min-h-0 flex-1 space-y-4 overflow-y-auto ${expanded ? 'p-6' : 'p-4'}`}>
        {messages.map((message) => {
          const isUser = message.role === 'user';
          const isRunningAssistant =
            !isUser &&
            isLoading &&
            message.id === messages[messages.length - 1]?.id;

          return (
            <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`chat-message ${isUser ? 'chat-message-user' : 'chat-message-assistant'} ${expanded ? 'max-w-[80%]' : 'max-w-[90%]'}`}
              >
                <AutoAnimateHeight duration={180} contentClassName="flow-root">
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  ) : (
                    <div className="ai-chat-markdown max-w-none">
                      <TextMessagePartProvider text={message.content} isRunning={isRunningAssistant}>
                        <MarkdownText />
                      </TextMessagePartProvider>
                    </div>
                  )}
                </AutoAnimateHeight>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      <div className={`chat-composer ${expanded ? 'p-5' : 'p-4'}`}>
        <div className="chat-composer-field flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="日语问题"
            placeholder="问一个日语问题…"
            className="chat-input min-h-[36px] min-w-0 flex-1 resize-none"
            rows={expanded ? 2 : 1}
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="nd-primary-btn chat-send-button"
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
          className="chat-backdrop fixed inset-0 z-40"
          onClick={() => setIsExpanded(false)}
        />
      )}

      {isExpanded && (
        <div
          className="chat-expanded-panel fixed z-50 flex flex-col overflow-hidden rounded-2xl"
          style={{
            top: '50%',
            left: '50%',
            width: 'min(860px, calc(100vw - 32px))',
            height: 'min(720px, calc(100dvh - 48px))',
            transform: 'translate(-50%, -50%)',
            background: 'var(--bg-2)',
            border: '1px solid var(--line)',
          }}
        >
          {renderChatPanel(true)}
        </div>
      )}

      {!isExpanded && (
        <AssistantModalPrimitive.Root
          open={isOpen}
          onOpenChange={handlePopoverOpenChange}
          unstable_openOnRunStart={false}
        >
          <AssistantModalPrimitive.Anchor className="assistant-modal-anchor">
            <AssistantModalPrimitive.Trigger asChild>
              <button
                className="nd-fab assistant-modal-trigger"
                title="AI 日语助手"
                type="button"
                aria-label={isOpen ? '关闭 AI 日语助手' : '打开 AI 日语助手'}
              >
                <AnimatePresence initial={false} mode="wait">
                  {isOpen ? (
                    <motion.span
                      key="close"
                      className="assistant-modal-trigger-icon"
                      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, rotate: -90, scale: 0.5 }}
                      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, rotate: 0, scale: 1 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.5 }}
                      transition={iconTransition}
                    >
                      {Icon.x}
                    </motion.span>
                  ) : (
                    <motion.span
                      key="chat"
                      className="assistant-modal-trigger-icon"
                      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, rotate: 90, scale: 0.5 }}
                      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, rotate: 0, scale: 1 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.5 }}
                      transition={iconTransition}
                    >
                      {Icon.chat}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </AssistantModalPrimitive.Trigger>
          </AssistantModalPrimitive.Anchor>

          <AssistantModalPrimitive.Content
            forceMount
            side="top"
            align="end"
            sideOffset={12}
            avoidCollisions={false}
            dissmissOnInteractOutside
            className="assistant-modal-content-positioner"
          >
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="assistant-chat-panel"
                  className="assistant-modal-panel"
                  initial={panelInitial}
                  animate={panelAnimate}
                  exit={{ ...panelExit, transition: panelExitTransition }}
                  transition={panelEnterTransition}
                  style={{ transformOrigin: 'bottom right' }}
                >
                  {renderChatPanel(false)}
                </motion.div>
              )}
            </AnimatePresence>
          </AssistantModalPrimitive.Content>
        </AssistantModalPrimitive.Root>
      )}
    </>
  );
}
