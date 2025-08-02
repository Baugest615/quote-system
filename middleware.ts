// middleware.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 🔧 明確排除靜態檔案和特殊路徑
  const shouldSkip = 
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.') // 所有包含點的路徑（通常是靜態檔案）

  if (shouldSkip) {
    return NextResponse.next()
  }

  // 檢查環境變數是否存在
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables')
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({
              name,
              value,
              ...options,
            })
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({
              name,
              value,
              ...options,
            })
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({
              name,
              value: '',
              ...options,
            })
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({
              name,
              value: '',
              ...options,
            })
          },
        },
      }
    )

    // 檢查是否為受保護的路由
    const protectedRoutes = ['/dashboard']
    const authRoutes = ['/auth/login']

    if (protectedRoutes.some(route => pathname.startsWith(route))) {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          return NextResponse.redirect(new URL('/auth/login', request.url))
        }

        return response
      } catch (error) {
        console.error('Auth error in protected route:', error)
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }
    }

    // 如果已登入的用戶訪問登入頁面，重定向到 dashboard
    if (authRoutes.some(route => pathname.startsWith(route))) {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          return NextResponse.redirect(new URL('/dashboard', request.url))
        }
      } catch (error) {
        console.error('Auth check error:', error)
      }
    }

    return response

  } catch (error) {
    console.error('Middleware error:', error)
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
}

// 🔧 使用更簡單的 matcher，只匹配我們真正需要保護的路由
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/auth/:path*',
    '/',
  ],
}