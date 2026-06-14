'use client';

import { useState, useEffect, useCallback } from 'react';
import { AIProvider, EpubSection, generateEpubContent } from '../services/api';
import { Icon } from './Icons';
import { generateEpubBlob, downloadEpub } from '../utils/epub';
import ThinkingIndicator from './ThinkingIndicator';
import { AutoAnimateHeight } from '@/components/ui/auto-animate-height';

interface EpubExportProps {
  currentSentence: string;
  userApiKey?: string;
  aiProvider: AIProvider;
  active: boolean;
  generateTrigger: number;
}

/** Epub 图标 */
function EpubIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M12 7v7" />
      <path d="M9 11l3 3 3-3" />
    </svg>
  );
}

export default function EpubExport({
  currentSentence,
  userApiKey,
  aiProvider,
  active,
  generateTrigger,
}: EpubExportProps) {
  const [epubSections, setEpubSections] = useState<EpubSection[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  // 仅点击绿色按钮时触发生成，切换 tab 不触发
  useEffect(() => {
    if (!active || !currentSentence || generateTrigger === 0) return;

    let cancelled = false;

    const generate = async () => {
      setIsGenerating(true);
      setGenerateError('');
      setEpubSections(null);

      try {
        const sections = await generateEpubContent(currentSentence, userApiKey, aiProvider);
        if (!cancelled) {
          setEpubSections(sections);
        }
      } catch (err) {
        if (!cancelled) {
          setGenerateError(err instanceof Error ? err.message : 'Epub 生成失败');
        }
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    };

    generate();
    return () => { cancelled = true; };
  }, [generateTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = useCallback(() => {
    setGenerateError('');
    setEpubSections(null);
    setIsGenerating(true);

    generateEpubContent(currentSentence, userApiKey, aiProvider)
      .then((sections) => {
        setEpubSections(sections);
        setIsGenerating(false);
      })
      .catch((err) => {
        setGenerateError(err instanceof Error ? err.message : 'Epub 生成失败');
        setIsGenerating(false);
      });
  }, [currentSentence, userApiKey, aiProvider]);

  const handleDownload = useCallback(async () => {
    if (!epubSections || epubSections.length === 0) return;

    setIsDownloading(true);
    try {
      const blob = await generateEpubBlob({ sections: epubSections });
      const today = new Date().toISOString().slice(0, 10);
      downloadEpub(blob, `日语解析笔记-${today}.epub`);
    } catch (err) {
      console.error('Epub 生成失败:', err);
    } finally {
      setIsDownloading(false);
    }
  }, [epubSections]);

  if (!active) return null;

  return (
    <section className="epub-preview-panel">
      {/* 标题行 */}
      <div className="epub-preview-title">
        <span className="grid place-items-center" style={{ color: '#10b981' }}>
          <EpubIcon />
        </span>
        <h2>Epub 输出预览</h2>
        <div className="flex-1" />
        {/* 下载按钮 */}
        {epubSections && !isGenerating && (
          <button
            className="nd-primary-btn"
            onClick={handleDownload}
            disabled={isDownloading}
            style={{
              background: isDownloading ? 'var(--ink-3)' : '#10b981',
              boxShadow: isDownloading
                ? 'none'
                : '0 4px 14px -4px rgba(16, 185, 129, 0.55)',
              padding: '6px 16px',
              fontSize: '13px',
            }}
            type="button"
          >
            {isDownloading ? (
              <>
                <span className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                生成中…
              </>
            ) : (
              <>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                下载
              </>
            )}
          </button>
        )}
      </div>

      <AutoAnimateHeight duration={300}>
        <div className="epub-preview-content">
          {/* 加载中 */}
          {isGenerating && (
            <ThinkingIndicator className="py-4" />
          )}

          {/* 错误 */}
          {generateError && !isGenerating && (
            <div
              className="flex flex-col items-center gap-3 py-4"
              style={{ color: 'var(--ink-2)' }}
            >
              <p className="text-sm" style={{ color: '#ef4444' }}>{generateError}</p>
              <button
                className="nd-soft-btn"
                onClick={handleRetry}
                type="button"
              >
                {Icon.refresh}
                <span>重试</span>
              </button>
            </div>
          )}

          {/* AI 生成的内容 */}
          {epubSections && !isGenerating && (
            <>
              {epubSections.map((sec, i) => (
                <div key={i} className={i > 0 ? 'epub-section-divider' : ''}>
                  {/* 序号 + 原文 */}
                  <p className="epub-original">{i + 1}. {sec.text}</p>

                  {/* 逐词解析 */}
                  {sec.words.length > 0 && (
                    <ul className="epub-word-list">
                      {sec.words.map((line, j) => (
                        <li key={j}>{line}</li>
                      ))}
                    </ul>
                  )}

                  {/* 译文（引用样式） */}
                  <blockquote className="epub-translation">
                    {sec.translation}
                  </blockquote>
                </div>
              ))}
            </>
          )}

          {/* 空状态 */}
          {!epubSections && !isGenerating && !generateError && (
            <p style={{ color: 'var(--ink-3)', textAlign: 'center' }}>
              正在准备 AI 分解内容…
            </p>
          )}
        </div>
      </AutoAnimateHeight>

    </section>
  );
}
