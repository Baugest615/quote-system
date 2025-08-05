import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { PAGE_PERMISSIONS, UserRole } from '@/types/database.types'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 🔧 明確排除靜態檔案和特殊路徑
  const shouldSkip = 
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.')

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

    // 🆕 路由與頁面映射
    const routeToPageMap: Record<string, string> = {
      '/dashboard': 'dashboard',
      '/dashboard/clients': 'clients',
      '/dashboard/kols': 'kols', 
      '/dashboard/quotes': 'quotes',
      '/dashboard/reports': 'reports',
      '/dashboard/pending-payments': 'pending_payments',
      '/dashboard/payment-requests': 'payment_requests',
      '/dashboard/confirmed-payments': 'confirmed_payments',
      '/dashboard/settings': 'settings',
    }

    // 公開路由 - 不需要認證
    const publicRoutes = ['/auth/login', '/auth/register', '/auth/forgot-password']
    
    // 檢查是否為公開路由
    if (publicRoutes.includes(pathname)) {
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

    // 保護的路由 - 需要認證和權限
    if (pathname.startsWith('/dashboard')) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
          return NextResponse.redirect(new URL('/auth/login', request.url))
        }

        // 🆕 基本權限檢查（簡化版本）
        const pageKey = getPageKeyFromPath(pathname, routeToPageMap)
        
        if (pageKey) {
          // 檢查特殊權限頁面
          const restrictedPages = ['payment_requests', 'confirmed_payments']
          
          if (restrictedPages.includes(pageKey)) {
            // 取得用戶角色進行檢查
            const { data: profile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', user.id)
              .single()

            const userRole = profile?.role
            
            // 只有 Admin 和 Editor 可以存取這些頁面
            if (userRole !== 'Admin' && userRole !== 'Editor') {
              return NextResponse.redirect(
                new URL('/dashboard?error=permission_denied', request.url)
              )
            }
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
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
}

// 🆕 從路徑取得頁面鍵值的輔助函數
function getPageKeyFromPath(pathname: string, routeMap: Record<string, string>): string | null {
  // 精確匹配
  if (routeMap[pathname]) {
    return routeMap[pathname]
  }
  
  // 模糊匹配（處理動態路由）
  for (const route in routeMap) {
    if (pathname.startsWith(route)) {
      return routeMap[route]
    }
  }
  
  return null
}

// 🔧 使用更簡單的 matcher，只匹配我們真正需要保護的路由
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/auth/:path*',
    '/',
  ],
}