'use client';

import { useEffect } from 'react';

// 字体的 @font-face 表放到首屏之后再拉：Noto Sans JP 按 unicode-range 切片后每个字重的表约 100 KB，
// 同步引入会作为渲染阻塞 CSS 拖慢 FCP/LCP。字体本身是 font-display: swap，先用系统字体渲染即可。
// 日文字体只用到 400/500；粗体都在系统界面字体上，不引入 700。
export default function DeferredFonts() {
  useEffect(() => {
    void import('@fontsource/noto-sans-jp/400.css');
    void import('@fontsource/noto-sans-jp/500.css');
    void import('@fontsource/jetbrains-mono/latin-400.css');
    void import('@fontsource/jetbrains-mono/latin-500.css');
  }, []);

  return null;
}
