// middleware.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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

    const { pathname } = request.nextUrl

    // 公開路由 - 不需要認證
    const publicRoutes = ['/auth/login', '/auth/register', '/auth/forgot-password']
    
    // 管理員專用路由
    const adminRoutes = ['/dashboard/clients', '/dashboard/settings']

    // 檢查是否為公開路由
    if (publicRoutes.includes(pathname)) {
      // 嘗試取得用戶資訊，但不強制要求
      try {
        const { data: { user } } = await supabase.auth.getUser()
        // 如果已登入用戶訪問登入頁面，重定向到儀表板
        if (user && pathname === '/auth/login') {
          return NextResponse.redirect(new URL('/dashboard', request.url))
        }
      } catch (error) {
        console.log('Auth check failed for public route:', error)
      }
      return response
    }

    // 檢查根路徑
    if (pathname === '/') {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          return NextResponse.redirect(new URL('/dashboard', request.url))
        } else {
          return NextResponse.redirect(new URL('/auth/login', request.url))
        }
      } catch (error) {
        console.log('Auth check failed for root route:', error)
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }
    }

    // 保護的路由 - 需要認證
    if (pathname.startsWith('/dashboard')) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
          return NextResponse.redirect(new URL('/auth/login', request.url))
        }

        // 檢查管理員權限
        if (adminRoutes.some(route => pathname.startsWith(route))) {
          try {
            // 簡化權限檢查，假設如果用戶能登入就有基本權限
            // 你可以根據需要調整這個邏輯
            const { data: profile, error } = await supabase
              .from('users')
              .select('role')
              .eq('id', user.id)
              .single()

            if (error) {
              console.log('Role check error:', error)
              // 如果無法檢查權限，允許繼續（而不是阻擋）
              return response
            }

            if (profile?.role !== 'admin') {
              return NextResponse.redirect(new URL('/dashboard?error=permission_denied', request.url))
            }
          } catch (error) {
            console.error('Error checking user role:', error)
            // 權限檢查失敗時，允許繼續而不是重定向
            return response
          }
        }

        return response
      } catch (error) {
        console.error('Auth error in protected route:', error)
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }
    }

    return response

  } catch (error) {
    console.error('Middleware error:', error)
    // 發生錯誤時，重定向到登入頁面
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}