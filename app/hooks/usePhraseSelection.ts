'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PhraseRange } from '../utils/phraseRange';

// 手机上长按多久进入圈选
const LONG_PRESS_MS = 450;
// 长按期间手指移动超过这个距离视为滚动，取消长按
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

function tokenIndexFromTarget(target: EventTarget | null): number | null {
  const element = target instanceof Element ? target.closest('[data-token-index]') : null;
  if (!element) return null;
  const index = Number(element.getAttribute('data-token-index'));
  return Number.isInteger(index) ? index : null;
}

interface UsePhraseSelectionOptions {
  /** 未提供时不启用圈选（如解析进行中） */
  onRangeSelect?: (a: number, b: number) => void;
  /** Shift 点击的起点：当前选中的词或选区起点 */
  anchorIndex: number | null;
  /** 圈选起点（长按或详情里的「选中多个词」按钮设置），由页面持有 */
  pickAnchor: number | null;
  onPickAnchorChange: (index: number | null) => void;
}

/**
 * 在解析结果上圈选连续多个词：
 * - 鼠标：按住拖过几个词；或 Shift + 点击，从当前选中的词选到点击处
 * - 触屏：长按一个词进入圈选，再点另一个词
 * - 两端通用：单词详情里的「选中多个词」按钮进入圈选，再点另一个词
 * 单纯点击仍交给原来的单词释义。
 */
export function usePhraseSelection({ onRangeSelect, anchorIndex, pickAnchor, onPickAnchorChange }: UsePhraseSelectionOptions) {
  const [preview, setPreview] = useState<PhraseRange | null>(null);
  const dragRef = useRef<{ anchor: number; current: number } | null>(null);
  const pressRef = useRef<{ timer: number; x: number; y: number } | null>(null);
  // 拖动、Shift 点击、长按之后紧跟的 click 不再当作单词点击
  const suppressClickRef = useRef(false);
  const enabled = !!onRangeSelect;

  const clearPress = useCallback(() => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  }, []);

  const cancelPick = useCallback(() => onPickAnchorChange(null), [onPickAnchorChange]);

  useEffect(() => {
    if (enabled) return;
    dragRef.current = null;
    setPreview(null);
    if (pickAnchor !== null) onPickAnchorChange(null);
  }, [enabled, onPickAnchorChange, pickAnchor]);

  useEffect(() => {
    const handlePointerUp = () => {
      clearPress();
      const drag = dragRef.current;
      dragRef.current = null;
      setPreview(null);
      if (drag && drag.current !== drag.anchor && onRangeSelect) {
        suppressClickRef.current = true;
        onRangeSelect(drag.anchor, drag.current);
      }
      // click 会在 pointerup 之后同步派发，之后再解除屏蔽
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      dragRef.current = null;
      setPreview(null);
      onPickAnchorChange(null);
    };
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [clearPress, onPickAnchorChange, onRangeSelect]);

  useEffect(() => clearPress, [clearPress]);

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    if (!onRangeSelect) return;
    const index = tokenIndexFromTarget(event.target);
    if (index === null) return;

    if (event.pointerType === 'mouse') {
      if (event.button !== 0) return;
      if (event.shiftKey && anchorIndex !== null && anchorIndex !== index) {
        event.preventDefault();
        suppressClickRef.current = true;
        onRangeSelect(anchorIndex, index);
        return;
      }
      dragRef.current = { anchor: index, current: index };
      return;
    }

    clearPress();
    const timer = window.setTimeout(() => {
      pressRef.current = null;
      suppressClickRef.current = true;
      onPickAnchorChange(index);
      navigator.vibrate?.(8);
    }, LONG_PRESS_MS);
    pressRef.current = { timer, x: event.clientX, y: event.clientY };
  }, [anchorIndex, clearPress, onPickAnchorChange, onRangeSelect]);

  const onPointerMove = useCallback((event: ReactPointerEvent) => {
    const press = pressRef.current;
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      clearPress();
    }
    const drag = dragRef.current;
    if (!drag) return;
    const index = tokenIndexFromTarget(event.target);
    if (index === null || index === drag.current) return;
    drag.current = index;
    setPreview(drag.current === drag.anchor
      ? null
      : { start: Math.min(drag.anchor, drag.current), end: Math.max(drag.anchor, drag.current) });
  }, [clearPress]);

  /** 词的点击：圈选状态下作为终点，否则返回 false 交给单词释义 */
  const handleTokenClick = useCallback((index: number): boolean => {
    if (suppressClickRef.current) return true;
    if (pickAnchor === null) return false;
    onPickAnchorChange(null);
    if (pickAnchor !== index) onRangeSelect?.(pickAnchor, index);
    return true;
  }, [onPickAnchorChange, onRangeSelect, pickAnchor]);

  return {
    preview,
    cancelPick,
    handleTokenClick,
    containerProps: enabled ? { onPointerDown, onPointerMove } : {},
  };
}
