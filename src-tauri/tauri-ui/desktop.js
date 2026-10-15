/* global window, document, URLSearchParams, setTimeout */
const invoke = (...args) => window.__TAURI__.core.invoke(...args);
const element = (id) => document.getElementById(id);
const settings = new URLSearchParams(window.location.search).has('settings');
element('settings').hidden = !settings;

async function poll() {
  try {
    const state = await invoke('server_status');
    element('version').textContent = `当前版本 / Current version: ${state.appVersion}`;
    element('status').textContent = state.message;
    element('retry').hidden = state.phase !== 'error';
    element('log').hidden = !settings && state.phase !== 'error';
    element('log').textContent = `日志 / Server log: ${state.logPath}`;
    if (!settings && state.phase === 'running' && state.url) {
      window.location.replace(state.url);
      return;
    }
  } catch (error) {
    element('status').textContent = String(error);
  }
  setTimeout(poll, 500);
}
element('retry').addEventListener('click', async () => {
  element('retry').disabled = true;
  try { await invoke('restart_server'); }
  catch (error) { element('status').textContent = String(error); }
  finally { element('retry').disabled = false; }
});

async function checkUpdate() {
  element('check-update').disabled = true;
  element('install-update').hidden = true;
  element('update-status').textContent = '正在检查… / Checking…';
  try {
    const update = await invoke('check_update');
    element('version').textContent = `当前版本 / Current version: ${update.currentVersion}`;
    element('update-status').textContent = update.version
      ? `有新版本 / Update available: ${update.version}`
      : '已是最新版本 / You are up to date.';
    element('update-notes').textContent = update.notes || '';
    element('install-update').hidden = !update.version || !update.canInstall;
  } catch (error) {
    element('update-status').textContent = `无法检查更新，请稍后重试或前往 Releases。 / Could not check for updates: ${String(error)}`;
  } finally { element('check-update').disabled = false; }
}
element('check-update').addEventListener('click', checkUpdate);
element('install-update').addEventListener('click', async () => {
  element('install-update').disabled = true;
  element('check-update').disabled = true;
  element('update-status').textContent = '正在下载并验证更新… / Downloading and verifying update…';
  try { await invoke('install_update'); }
  catch (error) { element('update-status').textContent = String(error); }
  finally {
    element('install-update').disabled = false;
    element('check-update').disabled = false;
  }
});
element('releases').addEventListener('click', async () => {
  try { await invoke('open_releases'); }
  catch (error) { element('update-status').textContent = String(error); }
});
poll();
if (settings) checkUpdate();
