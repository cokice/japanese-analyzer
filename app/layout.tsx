import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// 使用Inter字体
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "日本語文章解析器 - AI驱动",
  description: "AI驱动・深入理解日语句子结构与词义",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        {/* 预连接谷歌字体CDN以提高加载速度 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* 使用CDN直接加载Noto Sans JP字体，避免Vercel构建问题 */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        {/* 根据本地存储或系统偏好初始化主题 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
              try {
                const t = localStorage.getItem('theme');
                if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                }
              } catch (_) {}
            })();`,
          }}
        />
        {/* Safari输入修复脚本 */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
            if (isSafari) {
              document.documentElement.classList.add('safari');
              // 修复Safari中的输入问题
              document.addEventListener('DOMContentLoaded', function() {
                var inputs = document.querySelectorAll('input, textarea');
                inputs.forEach(function(input) {
                  input.style.webkitTextFillColor = 'black';
                  input.style.opacity = '1';
                });
              });
            }
          })();
        `}} />
      </head>
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
