import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "flowtoken/dist/styles.css";
import "streamdown/styles.css";
import "./globals.css";
import DeferredFonts from "./components/DeferredFonts";
import { LanguageProvider } from "./contexts/LanguageContext";
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
  // 首帧（CSS 生效前）就让浏览器知道两种配色都支持，减少深色模式下的白闪
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f8' },
    { media: '(prefers-color-scheme: dark)', color: '#24232b' }
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
        <link rel="icon" href="/logo/logo-dark.png" type="image/png" media="(prefers-color-scheme: dark)" />
        <link rel="apple-touch-icon" href="/logo/logo.png" />
        {/* 主题初始化脚本 - 防止闪烁 */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            function getThemePreference() {
              try {
                const saved = localStorage.getItem('theme');
                if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
              } catch {}
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
        {/* Safari 输入文字颜色修复：只打 html.safari 标记，颜色由 globals.css 按当前主题变量给出。
            不再写内联样式：内联值只在加载时取一次主题，切换主题后会过时。 */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
              document.documentElement.classList.add('safari');
            }
          })();
        `}} />
      </head>
      <body className="antialiased transition-colors duration-200">
        <DeferredFonts />
        <ThemeProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </ThemeProvider>
        <Script src="/api/umami/script" strategy="afterInteractive" />
      </body>
    </html>
  );
}
