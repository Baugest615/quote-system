import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { PAGE_PERMISSIONS, UserRole } from '@/types/custom.types'

// 從 PAGE_PERMISSIONS 自動產生路由對照表（不再手動維護）
const routeToPageMap: Record<string, string> = {}
for (const [pageKey, config] of Object.entries(PAGE_PERMISSIONS)) {
  routeToPageMap[config.route] = pageKey
}

// 所有角色清單，用於判斷是否為受限頁面
const ALL_ROLES: UserRole[] = ['Admin', 'Editor', 'Member']

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

    // 處理認證路由
    if (pathname.startsWith('/auth')) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user && pathname === '/auth/login') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      return response
    }

    // 處理根路徑
    if (pathname === '/') {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      } else {
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }
    }

    // 處理受保護的路由
    if (pathname.startsWith('/dashboard')) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error || !user) {
          return NextResponse.redirect(new URL('/auth/login', request.url))
        }

        // 資料驅動的權限檢查：從 PAGE_PERMISSIONS 動態判斷受限頁面
        const pageKey = getPageKeyFromPath(pathname, routeToPageMap)

        if (pageKey) {
          const pageConfig = PAGE_PERMISSIONS[pageKey]
          const isRestricted = pageConfig &&
            pageConfig.allowedRoles.length < ALL_ROLES.length

          if (isRestricted) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', user.id)
              .single()

            const userRole = (profile?.role || '') as UserRole

            if (!pageConfig.allowedRoles.includes(userRole)) {
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

    // 保護列印路由（需要身份驗證）
    if (pathname.startsWith('/print')) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
          return NextResponse.redirect(new URL('/auth/login', request.url))
        }
        return response
      } catch (error) {
        console.error('Auth error in print route:', error)
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }
    }

    return response

  } catch (error) {
    console.error('Middleware error:', error)
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
}

// 從路徑取得頁面鍵值的輔助函數
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

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/auth/:path*',
    '/print/:path*',
    '/',
  ],
}