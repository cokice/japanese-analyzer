// Next.js 在服务启动时调用一次 register()。
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { runStartupSecurityChecks } = await import('./app/api/_utils/startupChecks');
  runStartupSecurityChecks();
}
