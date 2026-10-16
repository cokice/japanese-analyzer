/* global window, document, localStorage, navigator, URLSearchParams, setTimeout, setInterval, clearInterval */
// 支持在原生 Tauri 容器或常规浏览器中优雅运行
const invoke = async (...args) => {
  if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
    return window.__TAURI__.core.invoke(...args);
  }
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        appVersion: '1.0.0 (Preview)',
        phase: 'starting',
        message: '',
        url: null,
        logPath: 'browser/preview.log',
      });
    }, 500);
  });
};

const element = (id) => document.getElementById(id);
const settings = new URLSearchParams(window.location.search).has('settings');
if (element('settings')) {
  element('settings').hidden = !settings;
}

// ==========================================
// 1. 本地化多语言字典（严格根据用户语言单语显示）
// ==========================================
const HAS_LAUNCHED_KEY = 'ja_launcher_launched';

function getAppLocale() {
  try {
    const saved = localStorage.getItem('language');
    if (saved && ['zh-CN', 'zh-TW', 'en', 'ko'].includes(saved)) {
      return saved;
    }
  } catch (_) {}

  const sysLang = (navigator.language || '').toLowerCase();
  if (sysLang.startsWith('zh-tw') || sysLang.startsWith('zh-hk')) return 'zh-TW';
  if (sysLang.startsWith('zh')) return 'zh-CN';
  if (sysLang.startsWith('ko')) return 'ko';
  return 'en';
}

const currentLocale = getAppLocale();

const UI_MESSAGES = {
  starting: {
    'zh-CN': '正在启动服务…',
    'zh-TW': '正在啟動服務…',
    en: 'Starting local service…',
    ko: '로컬 서비스 시작 중…',
  },
  loadingEngine: {
    'zh-CN': '正在加载语法分析引擎…',
    'zh-TW': '正在載入語法分析引擎…',
    en: 'Loading analysis engine…',
    ko: '구문 분석 엔진 로딩 중…',
  },
  ready: {
    'zh-CN': '准备就绪',
    'zh-TW': '準備就緒',
    en: 'Ready',
    ko: '준비 완료',
  },
  retry: {
    'zh-CN': '重试',
    'zh-TW': '重試',
    en: 'Retry',
    ko: '다시 시도',
  },
  reassignPort: {
    'zh-CN': '重新分配端口',
    'zh-TW': '重新分配通訊埠',
    en: 'Reassign port',
    ko: '포트 재할당',
  },
  checkingUpdate: {
    'zh-CN': '正在检查更新…',
    'zh-TW': '正在檢查更新…',
    en: 'Checking for updates…',
    ko: '업데이트 확인 중…',
  },
  updateAvailable: {
    'zh-CN': '发现新版本：',
    'zh-TW': '發現新版本：',
    en: 'Update available: ',
    ko: '새 버전 사용 가능: ',
  },
  upToDate: {
    'zh-CN': '已是最新版本',
    'zh-TW': '已是最新版本',
    en: 'You are up to date.',
    ko: '최신 버전입니다.',
  },
  downloadingUpdate: {
    'zh-CN': '正在下载并验证更新…',
    'zh-TW': '正在下載並驗證更新…',
    en: 'Downloading and verifying update…',
    ko: '업데이트 다운로드 및 확인 중…',
  },
  updateCheckFailed: {
    'zh-CN': '无法检查更新，请稍后重试。',
    'zh-TW': '無法檢查更新，請稍後重試。',
    en: 'Could not check for updates.',
    ko: '업데이트를 확인할 수 없습니다.',
  },
  logLabel: {
    'zh-CN': '日志：',
    'zh-TW': '日誌：',
    en: 'Server log: ',
    ko: '로그: ',
  },
  versionLabel: {
    'zh-CN': '当前版本：',
    'zh-TW': '目前版本：',
    en: 'Current version: ',
    ko: '현재 버전: ',
  },
  getStarted: {
    'zh-CN': '开始体验',
    'zh-TW': '開始體驗',
    en: 'Get Started',
    ko: '시작하기',
  },
  enterShortcut: {
    'zh-CN': '按 Enter 进入',
    'zh-TW': '按 Enter 進入',
    en: 'Press Enter to continue',
    ko: 'Enter 키를 눌러 계속하기',
  },
  touchAnywhere: {
    'zh-CN': '轻触任意位置启程 · 或按 Enter',
    'zh-TW': '輕觸任意位置啟程 · 或按 Enter',
    en: 'Click anywhere to begin or press Enter',
    ko: '화면을 터치하거나 Enter를 눌러 시작',
  },
};

function t(key, fallback = '') {
  const item = UI_MESSAGES[key];
  if (!item) return fallback;
  return item[currentLocale] || item['zh-CN'] || item.en || fallback;
}

// 格式化 Rust 返回的双语格式消息（如："服务启动失败 / Could not start..."）
function formatServerMessage(msg) {
  if (!msg) return '';
  if (msg.includes(' / ')) {
    const [zhPart, enPart] = msg.split(' / ');
    if (currentLocale === 'en') return enPart || msg;
    if (currentLocale === 'zh-TW') {
      // 简单转换或直接给繁体
      return zhPart || msg;
    }
    return zhPart || msg;
  }
  return msg;
}

// ==========================================
// 2. 励志短句库（分词、振假名、词性、多语言译文）
// ==========================================
const QUOTE_LIBRARY = [
  {
    // [Index 0]: 首次启动专属
    tokens: [
      { text: "言葉", ruby: "ことば", pos: "noun" },
      { text: "の", pos: "particle" },
      { text: "深み", ruby: "ふかみ", pos: "noun" },
      { text: "を", pos: "particle" },
      { text: "、", pos: "punct" },
      { text: "紐解く", ruby: "ひもとく", pos: "verb" },
      { text: "。", pos: "punct" }
    ],
    translation: {
      'zh-CN': "探寻言语的深意，解开文字之心。",
      'zh-TW': "探尋言語的深意，解開文字之心。",
      'en': "Unraveling the depth of words.",
      'ko': "말의 깊이를 헤아려, 문장의 마음을 풀다."
    }
  },
  {
    // 1. 松下幸之助
    tokens: [
      { text: "道", ruby: "みち", pos: "noun" },
      { text: "は", pos: "particle" },
      { text: "自分", ruby: "じぶん", pos: "noun" },
      { text: "で", pos: "particle" },
      { text: "、", pos: "punct" },
      { text: "切り拓く", ruby: "きりひらく", pos: "verb" },
      { text: "。", pos: "punct" }
    ],
    translation: {
      'zh-CN': "前路当由自己亲手开拓。",
      'zh-TW': "前路當由自己親手開拓。",
      'en': "Forge your own path ahead.",
      'ko': "길은 스스로 개척하는 것이다."
    }
  },
  {
    // 2. 经典格言
    tokens: [
      { text: "雨垂れ", ruby: "あまだれ", pos: "noun" },
      { text: "、", pos: "punct" },
      { text: "石", ruby: "いし", pos: "noun" },
      { text: "を", pos: "particle" },
      { text: "穿つ", ruby: "うがつ", pos: "verb" },
      { text: "。", pos: "punct" }
    ],
    translation: {
      'zh-CN': "水滴石穿，坚持终有所成。",
      'zh-TW': "水滴石穿，堅持終有所成。",
      'en': "Constant dripping hollows out the stone.",
      'ko': "낙숫물이 바위를 뚫는다."
    }
  },
  {
    // 3. 雲外蒼天
    tokens: [
      { text: "雲", ruby: "くも", pos: "noun" },
      { text: "を", pos: "particle" },
      { text: "抜ければ", ruby: "ぬければ", pos: "verb" },
      { text: "、", pos: "punct" },
      { text: "青空", ruby: "あおぞら", pos: "noun" },
      { text: "が", pos: "particle" },
      { text: "広がる", ruby: "ひろがる", pos: "verb" },
      { text: "。", pos: "punct" }
    ],
    translation: {
      'zh-CN': "穿透重云，眼前便是广阔晴空。",
      'zh-TW': "穿透重雲，眼前便是廣闊晴空。",
      'en': "Beyond the clouds lies the clear blue sky.",
      'ko': "구름을 벗어나면 푸른 하늘이 펼쳐진다."
    }
  },
  {
    // 4. 上杉鹰山
    tokens: [
      { text: "為せば", ruby: "なせば", pos: "verb" },
      { text: "成る", ruby: "なる", pos: "verb" },
      { text: "、", pos: "punct" },
      { text: "歩み", ruby: "あゆみ", pos: "noun" },
      { text: "を", pos: "particle" },
      { text: "とめるな", pos: "verb" },
      { text: "。", pos: "punct" }
    ],
    translation: {
      'zh-CN': "有志者事竟成，脚步莫停。",
      'zh-TW': "有志者事竟成，腳步莫停。",
      'en': "Where there is a will, there is a way.",
      'ko': "행하면 이루어지니, 발걸음을 멈추지 마라."
    }
  },
  {
    // 5. 持续积累
    tokens: [
      { text: "日々", ruby: "ひび", pos: "noun" },
      { text: "の", pos: "particle" },
      { text: "積み重ね", ruby: "つみかさね", pos: "noun" },
      { text: "が", pos: "particle" },
      { text: "、", pos: "punct" },
      { text: "力", ruby: "ちから", pos: "noun" },
      { text: "に", pos: "particle" },
      { text: "なる", pos: "verb" },
      { text: "。", pos: "punct" }
    ],
    translation: {
      'zh-CN': "日积月累，终成前行的力量。",
      'zh-TW': "日積月累，終成前行的力量。",
      'en': "Daily persistence turns into great strength.",
      'ko': "매일의 꾸준함이 곧 힘이 된다."
    }
  },
  {
    // 6. 今日迈步
    tokens: [
      { text: "今日", ruby: "きょう", pos: "noun" },
      { text: "の", pos: "particle" },
      { text: "一歩", ruby: "いっぽ", pos: "noun" },
      { text: "が", pos: "particle" },
      { text: "、", pos: "punct" },
      { text: "明日", ruby: "あす", pos: "noun" },
      { text: "を", pos: "particle" },
      { text: "拓く", ruby: "ひらく", pos: "verb" },
      { text: "。", pos: "punct" }
    ],
    translation: {
      'zh-CN': "今日迈出的一步，将开拓明日。",
      'zh-TW': "今日邁出的一步，將開拓明日。",
      'en': "A single step today paves the way for tomorrow.",
      'ko': "오늘 내딛는 한 걸음이 내일을 연다."
    }
  },
  {
    // 7. 春暖花开
    tokens: [
      { text: "冬", ruby: "ふゆ", pos: "noun" },
      { text: "を", pos: "particle" },
      { text: "越えて", ruby: "こえて", pos: "verb" },
      { text: "、", pos: "punct" },
      { text: "春", ruby: "はる", pos: "noun" },
      { text: "の", pos: "particle" },
      { text: "花", ruby: "はな", pos: "noun" },
      { text: "が", pos: "particle" },
      { text: "咲く", ruby: "さく", pos: "verb" },
      { text: "。", pos: "punct" }
    ],
    translation: {
      'zh-CN': "跨越严冬，春之繁花自会盛开。",
      'zh-TW': "跨越嚴冬，春之繁花自會盛開。",
      'en': "Endure the winter, and spring flowers will bloom.",
      'ko': "겨울을 지나면 봄의 꽃이 핀다."
    }
  }
];

let isFirstLaunch = true;
try {
  // 在普通浏览器中预览时，默认每次刷新都展示首次启动仪式感；
  // 也可以通过 ?first=0 测试非首次日常启动，通过 ?first=1 强制首次启动
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('first')) {
    isFirstLaunch = urlParams.get('first') !== '0';
  } else if (!window.__TAURI__ || !window.__TAURI__.core) {
    // 浏览器直接双击预览时：保持为首次启动，方便直观调测
    isFirstLaunch = true;
  } else {
    // 真正的 Tauri 桌面客户端中：严格遵循持久化存储
    isFirstLaunch = !localStorage.getItem(HAS_LAUNCHED_KEY);
  }
} catch (_) {}

// 选取文句（首次启动固定使用 index 0，老用户随机抽取）
const selectedQuote = isFirstLaunch
  ? QUOTE_LIBRARY[0]
  : QUOTE_LIBRARY[1 + Math.floor(Math.random() * (QUOTE_LIBRARY.length - 1))];

// 渲染文句结构
function renderQuote(quote) {
  const wrapper = element('quote-wrapper');
  wrapper.innerHTML = '';

  quote.tokens.forEach((token) => {
    const unit = document.createElement('div');
    const isPunct = token.pos === 'punct';
    unit.className = `word-unit pos-${token.pos} ${isPunct ? 'is-punct' : ''}`;

    const rubySpan = document.createElement('span');
    rubySpan.className = 'word-ruby';
    rubySpan.textContent = token.ruby || '';

    const bodySpan = document.createElement('span');
    bodySpan.className = 'word-body';
    bodySpan.textContent = token.text;

    unit.appendChild(rubySpan);
    unit.appendChild(bodySpan);
    wrapper.appendChild(unit);
  });

  const translation = quote.translation[currentLocale] || quote.translation['zh-CN'] || quote.translation.en;
  
  // 动态逐字流式打字输出 + 呼吸光晕
  startDynamicTranslation(translation);

  requestAnimationFrame(() => {
    element('stage-box').classList.add('visible');
  });
}

// 动态打字翻译 + 呼吸感调度
function startDynamicTranslation(fullText) {
  const container = element('quote-translation');
  container.innerHTML = '';
  container.classList.remove('breathe');

  const cursor = document.createElement('span');
  cursor.className = 'typing-cursor';
  container.appendChild(cursor);

  // 延迟 400ms 伴随汉字淡入后再启动动态打字
  setTimeout(() => {
    let charIndex = 0;
    const chars = Array.from(fullText); // 完美支持 Unicode emoji/标点
    const typeSpeed = Math.max(35, Math.min(80, 1600 / chars.length));

    const typeTimer = setInterval(() => {
      if (charIndex < chars.length) {
        const char = chars[charIndex];
        const span = document.createElement('span');
        span.className = 'trans-char';
        span.textContent = char;
        container.insertBefore(span, cursor);
        charIndex++;
      } else {
        clearInterval(typeTimer);
        // 打字完成，移除光标并开启轻柔呼吸呼吸动效
        setTimeout(() => {
          cursor.remove();
          container.classList.add('breathe');
        }, 500);
      }
    }, typeSpeed);
  }, 400);
}

renderQuote(selectedQuote);

// ==========================================
// 3. 进度与视觉阶段状态机
// ==========================================
let currentProgress = 0;
let progressInterval = null;
const stageBox = element('stage-box');
const progressFill = element('progress-fill');
const statusText = element('status');

// 初始化按钮文案单语化
element('retry').textContent = t('retry');
element('reassign-port').textContent = t('reassignPort');
statusText.textContent = t('starting');

function updateProgress(targetPercent, duration = 200) {
  currentProgress = Math.max(currentProgress, targetPercent);
  progressFill.style.transition = `width ${duration}ms linear`;
  progressFill.style.width = `${currentProgress}%`;

  if (currentProgress >= 25) {
    stageBox.classList.add('stage-furi');
  }
  if (currentProgress >= 50) {
    stageBox.classList.add('stage-tokenize');
  }
  if (currentProgress >= 65) {
    stageBox.classList.add('stage-highlight');
  }
}

// 模拟 Phase 3 的减速平滑逼近 (50% -> 88%)
function startPhase3Easing() {
  clearInterval(progressInterval);
  statusText.textContent = t('loadingEngine');
  progressInterval = setInterval(() => {
    if (currentProgress < 88) {
      const step = Math.max(0.4, (88 - currentProgress) * 0.06);
      updateProgress(currentProgress + step, 160);
    }
  }, 160);
}

// ==========================================
// 4. 首次启动专属：快捷键微标打字流（循环打字/回删）
// ==========================================
let shortcutLoopTimer = null;

function startShortcutTypewriter(text) {
  const textEl = element('shortcut-text');
  if (!textEl) return;

  const chars = Array.from(text);
  let index = 0;
  let isDeleting = false;

  function tick() {
    if (!isDeleting) {
      // 打字中
      index++;
      textEl.textContent = chars.slice(0, index).join('');
      if (index === chars.length) {
        // 打完后停留 2 秒
        isDeleting = true;
        shortcutLoopTimer = setTimeout(tick, 2000);
        return;
      }
      shortcutLoopTimer = setTimeout(tick, 70);
    } else {
      // 回删中
      index--;
      textEl.textContent = chars.slice(0, index).join('');
      if (index === 0) {
        // 删完后停留 600ms，再次开始打字
        isDeleting = false;
        shortcutLoopTimer = setTimeout(tick, 600);
        return;
      }
      shortcutLoopTimer = setTimeout(tick, 35);
    }
  }

  tick();
}

function stopShortcutTypewriter() {
  if (shortcutLoopTimer) {
    clearTimeout(shortcutLoopTimer);
    shortcutLoopTimer = null;
  }
}

// ==========================================
// 4. 首次启动专属：方案 2【全屏无界轻触 + 磁性准星光标】
// ==========================================
let isCeremonyActive = false;
let ambientCursorMoveHandler = null;

function setupAmbientCursor() {
  const cursor = element('ambient-cursor');

  // 平滑磁性跟随物理位置
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let currentX = mouseX;
  let currentY = mouseY;
  let rafId = null;

  function renderCursor() {
    // 弹性插值，带来丝滑滞后跟随感
    currentX += (mouseX - currentX) * 0.22;
    currentY += (mouseY - currentY) * 0.22;
    if (cursor) {
      cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    }
    if (isCeremonyActive) {
      rafId = requestAnimationFrame(renderCursor);
    }
  }

  ambientCursorMoveHandler = (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  };

  window.addEventListener('mousemove', ambientCursorMoveHandler);
  rafId = requestAnimationFrame(renderCursor);
}

// 点击屏幕任意位置触发的华丽水墨涟漪炸开特效
function spawnClickRipple(x, y) {
  const ripple = document.createElement('div');
  ripple.className = 'click-ripple-wave';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 800);
}

// 首次启动仪式感激活：方案 2
function activateFirstLaunchCeremony(targetUrl) {
  statusText.style.display = 'none';

  const promptArea = element('zen-prompt-area');
  if (promptArea) {
    promptArea.hidden = false;
  }

  // 启动下方极简循环打字微标提示（如："轻触任意位置启程 · 或按 ↵ Enter"）
  startShortcutTypewriter(t('touchAnywhere'));

  // 激活全屏交互状态与磁性跟随光标
  isCeremonyActive = true;
  document.body.classList.add('ready-for-entrance');
  setupAmbientCursor();

  let triggered = false;
  function triggerEnter(clickEvent) {
    if (triggered) return;
    triggered = true;
    isCeremonyActive = false;
    stopShortcutTypewriter();

    // 如果是通过鼠标点击触发，在点击位置炸开一圈紫色同心水波
    if (clickEvent && typeof clickEvent.clientX === 'number') {
      spawnClickRipple(clickEvent.clientX, clickEvent.clientY);
    } else {
      // 键盘 Enter 触发，在屏幕正中央展开水波
      spawnClickRipple(window.innerWidth / 2, window.innerHeight / 2);
    }

    try {
      localStorage.setItem(HAS_LAUNCHED_KEY, 'true');
    } catch (_) {}

    // 触发解构文字舒展散开
    stageBox.classList.add('stage-unravel');
    document.body.classList.remove('ready-for-entrance');

    setTimeout(() => {
      stageBox.classList.add('stage-leaving');
      setTimeout(() => {
        if (targetUrl) {
          window.location.replace(targetUrl);
        } else {
          console.log('Entrance triggered (Option 2 Preview)');
        }
      }, 320);
    }, 280);
  }

  // 1. 全屏任意位置轻触即可进入！
  const clickHandler = (e) => {
    // 忽略点击设置面板等弹层
    if (e.target && e.target.closest('#settings')) return;
    window.removeEventListener('click', clickHandler);
    triggerEnter(e);
  };
  window.addEventListener('click', clickHandler);

  // 2. 键盘 Enter 回车一键启程
  window.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      window.removeEventListener('click', clickHandler);
      triggerEnter(null);
    }
  };
}

// ==========================================
// 5. 轮询服务状态并驱动动效与跳转
// ==========================================
let hasRedirected = false;
let launchStartTime = Date.now();

// 启动初始：Phase 1 (15%~25%)
setTimeout(() => updateProgress(25, 300), 100);

// 如果是在纯浏览器里预览（非 Tauri 窗口），自动演示一遍完整动效
if (!window.__TAURI__ || !window.__TAURI__.core) {
  statusText.textContent = t('starting');
  setTimeout(() => {
    updateProgress(50, 400);
    startPhase3Easing();
  }, 600);
  setTimeout(() => {
    updateProgress(75, 400);
  }, 1500);
  setTimeout(() => {
    clearInterval(progressInterval);
    updateProgress(100, 200);
    stageBox.classList.add('stage-ready');
    if (isFirstLaunch) {
      activateFirstLaunchCeremony(null);
    } else {
      statusText.textContent = t('ready');
    }
  }, 2600);
}

async function poll() {
  if (!window.__TAURI__ || !window.__TAURI__.core) return;

  try {
    const state = await invoke('server_status');
    element('version').textContent = `${t('versionLabel')}${state.appVersion}`;
    element('retry').hidden = state.phase !== 'error';
    element('reassign-port').hidden = state.phase !== 'error';
    element('log').hidden = !settings && state.phase !== 'error';
    element('log').textContent = `${t('logLabel')}${state.logPath}`;

    if (state.phase === 'error') {
      clearInterval(progressInterval);
      statusText.textContent = formatServerMessage(state.message);
      progressFill.style.background = '#dc2626';
      return;
    }

    if (state.phase === 'starting') {
      if (currentProgress < 50) {
        updateProgress(50, 400);
        startPhase3Easing();
      }
    }

    if (!settings && state.phase === 'running' && state.url && !hasRedirected) {
      hasRedirected = true;
      clearInterval(progressInterval);

      // 达成 100%
      updateProgress(100, 200);
      stageBox.classList.add('stage-ready');

      if (isFirstLaunch) {
        // 首次启动：不自动跳走，呼出仪式感按钮与打字机微标
        activateFirstLaunchCeremony(state.url);
      } else {
        // 非首次启动：极速自动进入
        statusText.textContent = t('ready');
        try {
          localStorage.setItem(HAS_LAUNCHED_KEY, 'true');
        } catch (_) {}

        const elapsed = Date.now() - launchStartTime;
        const delay = Math.max(250, 800 - elapsed);

        setTimeout(() => {
          stageBox.classList.add('stage-leaving');
          setTimeout(() => {
            window.location.replace(state.url);
          }, 320);
        }, delay);
      }
      return;
    }
  } catch (error) {
    statusText.textContent = String(error);
  }

  if (!hasRedirected) {
    setTimeout(poll, 400);
  }
}

// ==========================================
// 5. 异常按钮与桌面设置事件
// ==========================================
element('retry').addEventListener('click', async () => {
  element('retry').disabled = true;
  element('reassign-port').disabled = true;
  try {
    currentProgress = 10;
    progressFill.style.background = '';
    updateProgress(20, 200);
    await invoke('restart_server');
    launchStartTime = Date.now();
    poll();
  } catch (error) {
    statusText.textContent = String(error);
  } finally {
    element('retry').disabled = false;
    element('reassign-port').disabled = false;
  }
});

element('reassign-port').addEventListener('click', async () => {
  element('reassign-port').disabled = true;
  element('retry').disabled = true;
  try {
    currentProgress = 10;
    progressFill.style.background = '';
    updateProgress(20, 200);
    await invoke('reassign_port');
    launchStartTime = Date.now();
    poll();
  } catch (error) {
    statusText.textContent = String(error);
  } finally {
    element('reassign-port').disabled = false;
    element('retry').disabled = false;
  }
});

async function checkUpdate() {
  element('check-update').disabled = true;
  element('install-update').hidden = true;
  element('update-status').textContent = t('checkingUpdate');
  try {
    const update = await invoke('check_update');
    element('version').textContent = `${t('versionLabel')}${update.currentVersion}`;
    element('update-status').textContent = update.version
      ? `${t('updateAvailable')}${update.version}`
      : t('upToDate');
    element('update-notes').textContent = update.notes || '';
    element('install-update').hidden = !update.version || !update.canInstall;
  } catch (error) {
    element('update-status').textContent = `${t('updateCheckFailed')} (${String(error)})`;
  } finally {
    element('check-update').disabled = false;
  }
}

element('check-update').addEventListener('click', checkUpdate);
element('install-update').addEventListener('click', async () => {
  element('install-update').disabled = true;
  element('check-update').disabled = true;
  element('update-status').textContent = t('downloadingUpdate');
  try {
    await invoke('install_update');
  } catch (error) {
    element('update-status').textContent = String(error);
  } finally {
    element('install-update').disabled = false;
    element('check-update').disabled = false;
  }
});

element('releases').addEventListener('click', async () => {
  try {
    await invoke('open_releases');
  } catch (error) {
    element('update-status').textContent = String(error);
  }
});

// 启动轮询
poll();
if (settings) checkUpdate();
