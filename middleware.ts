// src/hooks/useAuthGuard.ts - 頁面級認證保護
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import supabase from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

interface AuthGuardOptions {
  requireAuth?: boolean
  redirectTo?: string
  allowedRoles?: string[]
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

export function useAuthGuard(options: AuthGuardOptions = {}) {
  const {
    requireAuth = true,
    redirectTo = '/auth/login',
    allowedRoles = []
  } = options

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let mounted = true

    const checkAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (!mounted) return

        if (error) {
          console.error('Auth error:', error)
          if (requireAuth) {
            router.push(redirectTo)
            return
          }
        }

        const currentUser = session?.user || null
        setUser(currentUser)

        // 檢查是否需要認證
        if (requireAuth && !currentUser) {
          router.push(redirectTo)
          return
        }

        // 檢查角色權限（如果指定了）
        if (currentUser && allowedRoles.length > 0) {
          try {
            const { data: profile } = await supabase
              .from('users')
              .select('role')
              .eq('id', currentUser.id)
              .single()

            if (!profile || !allowedRoles.includes(profile.role)) {
              router.push('/dashboard?error=permission_denied')
              return
            }
          } catch (roleError) {
            console.error('Role check error:', roleError)
            // 如果角色檢查失敗，允許繼續（但記錄錯誤）
          }
        }

        setAuthorized(true)
      } catch (error) {
        console.error('Auth guard error:', error)
        if (requireAuth && mounted) {
          router.push(redirectTo)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    checkAuth()

    // 監聽認證狀態變化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        const currentUser = session?.user || null
        setUser(currentUser)

        if (event === 'SIGNED_OUT' && requireAuth) {
          router.push(redirectTo)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [requireAuth, redirectTo, allowedRoles, router])

  return {
    user,
    loading,
    authorized,
    isAuthenticated: !!user
  }
}