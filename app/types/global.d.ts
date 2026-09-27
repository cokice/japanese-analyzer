// 全局类型声明

// 添加ruby相关元素到JSX.IntrinsicElements
declare namespace JSX {
  interface IntrinsicElements {
    ruby: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    rt: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    rb: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  }
}

// 允许在客户端组件里动态 import 纯 CSS（见 DeferredFonts）
declare module '*.css';
