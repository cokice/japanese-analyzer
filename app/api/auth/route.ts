import { NextRequest, NextResponse } from 'next/server';
import { hasValidAuthSession, isAuthRequired, setAuthCookie } from '../_utils/sessionAuth';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    // 如果环境变量没有设置，则无需密码验证
    if (!isAuthRequired()) {
      return NextResponse.json({
        success: true,
        message: '无需密码验证',
      });
    }

    // 验证密码
    if (password === process.env.CODE) {
      const response = NextResponse.json({
        success: true,
        message: '验证成功',
      });
      setAuthCookie(response);
      return response;
    }

    return NextResponse.json({
      success: false,
      message: '密码错误，请重试',
    }, { status: 401 });
  } catch (error) {
    console.error('身份验证错误:', error);
    return NextResponse.json({
      success: false,
      message: '验证过程中发生错误',
    }, { status: 500 });
  }
}

// 获取是否需要密码验证的状态
export async function GET(request: NextRequest) {
  try {
    const requiresAuth = isAuthRequired();

    return NextResponse.json({
      requiresAuth,
      authenticated: !requiresAuth || hasValidAuthSession(request),
    });
  } catch (error) {
    console.error('获取验证状态错误:', error);
    return NextResponse.json({
      requiresAuth: false,
      authenticated: true,
    });
  }
}
