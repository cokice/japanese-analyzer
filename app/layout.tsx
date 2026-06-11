import type { Metadata, Viewport } from "next";
import "flowtoken/dist/styles.css";
import "./globals.css";
import { ThemeProvider } from "./contexts/ThemeContext";

export const metadata: Metadata = {
  title: "日本語文章解析器 - AI驱动",
  description: "AI驱动・深入理解日语句子结构与词义",
  icons: {
    icon: "/logo/logo.png",
    apple: "/logo/logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f6fb' },
    { media: '(prefers-color-scheme: dark)', color: '#16131f' }
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logo/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo/logo.png" />
        {/* 预连接字体CDN以提高加载速度 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* 新设计字体：中文正文、日文正文、日文衬线、等宽 */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@500;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* 主题初始化脚本 - 防止闪烁 */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            function getThemePreference() {
              if (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) {
                return localStorage.getItem('theme');
              }
              return 'system';
            }
            
            function getActualTheme(theme) {
              if (theme === 'system') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
              }
              return theme;
            }
            
            const theme = getThemePreference();
            const actualTheme = getActualTheme(theme);
            document.documentElement.classList.add(actualTheme);
          })();
        `}} />
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
                  var isDark = document.documentElement.classList.contains('dark');
                  input.style.webkitTextFillColor = isDark ? '#f9fafb' : 'black';
                  input.style.opacity = '1';
                });
              });
            }
          })();
        `}} />
      </head>
      <body className="antialiased transition-colors duration-200">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
