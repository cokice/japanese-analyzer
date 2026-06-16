export type UmamiConfig = {
  src: string;
  websiteId: string;
};

type Env = Record<string, string | undefined>;

export function resolveUmamiConfig(env: Env = process.env): UmamiConfig | null {
  const src = env.NEXT_PUBLIC_UMAMI_SRC?.trim();
  const websiteId = env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim();

  if (!src || !websiteId) {
    return null;
  }

  return { src, websiteId };
}

export function buildUmamiLoaderScript(config: UmamiConfig | null): string {
  if (!config) {
    return 'void 0;';
  }

  return `
(function() {
  if (window.__japaneseAnalyzerUmamiLoaded) {
    return;
  }

  window.__japaneseAnalyzerUmamiLoaded = true;

  var script = document.createElement('script');
  script.async = true;
  script.defer = true;
  script.src = ${JSON.stringify(config.src)};
  script.setAttribute('data-website-id', ${JSON.stringify(config.websiteId)});
  document.head.appendChild(script);
})();
`.trim();
}
