'use client';

import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { FaSun, FaMoon, FaDesktop } from 'react-icons/fa';

export default function ThemeToggle() {
  const { theme, actualTheme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const getThemeLabel = () => {
    switch (theme) {
      case 'light': return '亮色模式';
      case 'dark': return '暗色模式';
      case 'system': return '跟随系统';
      default: return '跟随系统';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        id="themeToggleButton"
        onClick={() => setIsOpen(!isOpen)}
        title={`切换主题 - ${getThemeLabel()}`}
      >
        {actualTheme === 'dark' ? <FaMoon className="text-lg" /> : <FaSun className="text-lg" />}
      </button>

      {isOpen && (
        <div id="themeToggleDropdown" className="w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
          <button
            onClick={() => {
              setTheme('light');
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 ${
              theme === 'light' 
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            <FaSun className="text-base" />
            <span className="text-sm font-medium">亮色模式</span>
          </button>
          
          <button
            onClick={() => {
              setTheme('dark');
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 ${
              theme === 'dark' 
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            <FaMoon className="text-base" />
            <span className="text-sm font-medium">暗色模式</span>
          </button>
          
          <button
            onClick={() => {
              setTheme('system');
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 ${
              theme === 'system' 
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            <FaDesktop className="text-base" />
            <span className="text-sm font-medium">跟随系统</span>
          </button>
          
          {theme === 'system' && (
            <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 mt-1">
              当前: {actualTheme === 'dark' ? '暗色' : '亮色'}模式
            </div>
          )}
        </div>
      )}
    </div>
  );
} 