// middleware.ts - 最簡化版本
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // 基本重定向：根路徑到登入頁
  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
  
  // 其他所有路由都允許通過
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * 只匹配根路徑
     */
    '/'
  ],
}