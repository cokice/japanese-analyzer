import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "flowtoken/dist/styles.css";
import "streamdown/styles.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
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
    { media: '(prefers-color-scheme: light)', color: '#f9f6ef' },
    { media: '(prefers-color-scheme: dark)', color: '#211f1a' }
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600&amp;family=Noto+Serif+SC:wght@500;600&amp;family=Shippori+Mincho:wght@500;600;700;800&amp;display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/logo/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo/logo.png" />
        {/* 主题初始化脚本 - 防止闪烁 */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            function getThemePreference() {
              if (typeof localStorage !== 'undefined') {
                const savedTheme = localStorage.getItem('theme');
                if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
                  return savedTheme;
                }
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
            document.documentElement.dataset.themePreference = theme;
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
                  input.style.webkitTextFillColor = 'currentColor';
                  input.style.opacity = '1';
                });
              });
            }
          })();
        `}} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Script src="/api/umami/script" strategy="afterInteractive" />
      </body>
    </html>
  );
}
