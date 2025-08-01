// middleware.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // 公開路由 - 不需要認證
  const publicRoutes = ['/auth/login', '/auth/register', '/auth/forgot-password']
  
  // 管理員專用路由
  const adminRoutes = ['/dashboard/clients', '/dashboard/settings']

  // 檢查是否為公開路由
  if (publicRoutes.includes(pathname)) {
    // 如果已登入用戶訪問登入頁面，重定向到儀表板
    if (user && pathname === '/auth/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // 檢查根路徑
  if (pathname === '/') {
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    } else {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  // 保護的路由 - 需要認證
  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    // 檢查管理員權限
    if (adminRoutes.some(route => pathname.startsWith(route))) {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (error || profile?.role !== 'admin') {
          return NextResponse.redirect(new URL('/dashboard?error=permission_denied', request.url))
        }
      } catch (error) {
        console.error('Error checking user role:', error)
        return NextResponse.redirect(new URL('/dashboard?error=auth_error', request.url))
      }
    }

    return response
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}