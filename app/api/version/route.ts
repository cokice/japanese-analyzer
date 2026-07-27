import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function GET() {
  // 本地开发时可用 git 查 commit；云端 Azure 无 .git 则回退
  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    // Azure 部署环境没有 .git 目录
  }

  return NextResponse.json({
    commit,
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || 'unknown',
  });
}

export const dynamic = 'force-dynamic';
