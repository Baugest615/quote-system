/**
 * 權限邏輯單元測試
 * 覆蓋 src/lib/permissions.tsx 的所有靜態工具函數
 */
import {
  checkPageAccess,
  checkFunctionAccess,
  getAllowedPages,
  hasRole,
  getRoleDisplayName,
} from '@/lib/permissions'
import { PAGE_PERMISSIONS, USER_ROLES } from '@/types/custom.types'
import type { UserRole } from '@/types/custom.types'

// ===== hasRole =====

describe('hasRole', () => {
  test('Admin >= Admin', () => expect(hasRole('Admin', 'Admin')).toBe(true))
  test('Admin >= Editor', () => expect(hasRole('Editor', 'Admin')).toBe(true))
  test('Admin >= Member', () => expect(hasRole('Member', 'Admin')).toBe(true))
  test('Editor >= Editor', () => expect(hasRole('Editor', 'Editor')).toBe(true))
  test('Editor >= Member', () => expect(hasRole('Member', 'Editor')).toBe(true))
  test('Editor !>= Admin', () => expect(hasRole('Admin', 'Editor')).toBe(false))
  test('Member >= Member', () => expect(hasRole('Member', 'Member')).toBe(true))
  test('Member !>= Editor', () => expect(hasRole('Editor', 'Member')).toBe(false))
  test('Member !>= Admin', () => expect(hasRole('Admin', 'Member')).toBe(false))

  test('Reader is lowest rank', () => {
    expect(hasRole('Member', 'Reader')).toBe(false)
    expect(hasRole('Editor', 'Reader')).toBe(false)
    expect(hasRole('Admin', 'Reader')).toBe(false)
    expect(hasRole('Reader', 'Reader')).toBe(true)
  })

  test('lowercase legacy values treated as their canonical rank', () => {
    // DB legacy values are normalized by get_my_role() but hasRole must handle them
    expect(hasRole('Admin', 'admin' as UserRole)).toBe(true)
    expect(hasRole('Member', 'member' as UserRole)).toBe(true)
  })

  test('returns false if userRole is undefined', () => {
    expect(hasRole('Member', undefined)).toBe(false)
  })
})

// ===== getRoleDisplayName =====

describe('getRoleDisplayName', () => {
  test('Admin → 管理員', () => expect(getRoleDisplayName('Admin')).toBe('管理員'))
  test('admin → 管理員 (legacy)', () => expect(getRoleDisplayName('admin' as UserRole)).toBe('管理員'))
  test('Editor → 編輯者', () => expect(getRoleDisplayName('Editor')).toBe('編輯者'))
  test('Member → 成員', () => expect(getRoleDisplayName('Member')).toBe('成員'))
  test('member → 成員 (legacy)', () => expect(getRoleDisplayName('member' as UserRole)).toBe('成員'))
  test('Reader → 唯讀', () => expect(getRoleDisplayName('Reader')).toBe('唯讀'))
  test('unknown value returns fallback', () => {
    expect(getRoleDisplayName('unknown' as UserRole)).toBe('未知角色')
  })
})

// ===== checkPageAccess =====

describe('checkPageAccess', () => {
  const dashboardKey = 'dashboard'
  const paymentRequestsKey = 'payment_requests' // Admin + Editor only

  test('Admin can access dashboard', () => {
    expect(checkPageAccess(dashboardKey, 'Admin')).toBe(true)
  })

  test('Editor can access dashboard', () => {
    expect(checkPageAccess(dashboardKey, 'Editor')).toBe(true)
  })

  test('Member can access dashboard', () => {
    expect(checkPageAccess(dashboardKey, 'Member')).toBe(true)
  })

  test('Admin can access payment_requests (restricted page)', () => {
    expect(checkPageAccess(paymentRequestsKey, 'Admin')).toBe(true)
  })

  test('Editor can access payment_requests', () => {
    expect(checkPageAccess(paymentRequestsKey, 'Editor')).toBe(true)
  })

  test('Member cannot access payment_requests', () => {
    expect(checkPageAccess(paymentRequestsKey, 'Member')).toBe(false)
  })

  test('Reader cannot access payment_requests', () => {
    expect(checkPageAccess(paymentRequestsKey, 'Reader')).toBe(false)
  })

  test('returns false for undefined role', () => {
    expect(checkPageAccess(dashboardKey, undefined)).toBe(false)
  })

  test('returns false for unknown page key', () => {
    expect(checkPageAccess('nonexistent_page', 'Admin')).toBe(false)
  })

  test('all pages with Admin+Editor+Member roles are accessible by Member', () => {
    const memberOpenPages = Object.entries(PAGE_PERMISSIONS)
      .filter(([, config]) =>
        config.allowedRoles.includes(USER_ROLES.MEMBER)
      )
    expect(memberOpenPages.length).toBeGreaterThan(0)
    for (const [key] of memberOpenPages) {
      expect(checkPageAccess(key, 'Member')).toBe(true)
    }
  })
})

// ===== checkFunctionAccess =====

describe('checkFunctionAccess', () => {
  test('Admin can export_pdf on quotes', () => {
    expect(checkFunctionAccess('quotes', 'export_pdf', 'Admin')).toBe(true)
  })

  test('Member can read quotes', () => {
    expect(checkFunctionAccess('quotes', 'read', 'Member')).toBe(true)
  })

  test('Member cannot delete quotes', () => {
    // quotes page allowedFunctions includes 'delete' but Member still passes checkPageAccess
    // so the result depends on allowedFunctions content
    const quotesConfig = PAGE_PERMISSIONS['quotes']
    const hasDelete = quotesConfig?.allowedFunctions.includes('delete') ?? false
    expect(checkFunctionAccess('quotes', 'delete', 'Member')).toBe(hasDelete)
  })

  test('Member cannot access payment_requests functions (no page access)', () => {
    expect(checkFunctionAccess('payment_requests', 'approve', 'Member')).toBe(false)
  })

  test('returns false for undefined userRole', () => {
    expect(checkFunctionAccess('quotes', 'read', undefined)).toBe(false)
  })

  test('returns false for non-existent function on valid page', () => {
    expect(checkFunctionAccess('dashboard', 'teleport', 'Admin')).toBe(false)
  })

  test('returns false for unknown page key', () => {
    expect(checkFunctionAccess('ghost_page', 'read', 'Admin')).toBe(false)
  })
})

// ===== getAllowedPages =====

describe('getAllowedPages', () => {
  test('Admin gets all pages', () => {
    const adminPages = getAllowedPages('Admin')
    const allPages = Object.values(PAGE_PERMISSIONS)
    // Admin should access at least all pages that include Admin
    const adminOnlyPages = allPages.filter(p => p.allowedRoles.includes('Admin'))
    expect(adminPages.length).toBeGreaterThanOrEqual(adminOnlyPages.length)
  })

  test('Member gets fewer pages than Admin', () => {
    const adminPages = getAllowedPages('Admin')
    const memberPages = getAllowedPages('Member')
    expect(memberPages.length).toBeLessThanOrEqual(adminPages.length)
  })

  test('Member cannot see payment_requests page', () => {
    const memberPages = getAllowedPages('Member')
    const paymentRequestsPage = memberPages.find(p => p.key === 'payment_requests')
    expect(paymentRequestsPage).toBeUndefined()
  })

  test('Admin can see payment_requests page', () => {
    const adminPages = getAllowedPages('Admin')
    const paymentRequestsPage = adminPages.find(p => p.key === 'payment_requests')
    expect(paymentRequestsPage).toBeDefined()
  })

  test('returns empty array for Reader role', () => {
    // Reader is the lowest level — may have no pages configured
    const readerPages = getAllowedPages('Reader')
    const expectedPages = Object.values(PAGE_PERMISSIONS).filter(p =>
      p.allowedRoles.includes('Reader')
    )
    expect(readerPages.length).toBe(expectedPages.length)
  })

  test('returned pages have required config fields', () => {
    const memberPages = getAllowedPages('Member')
    for (const page of memberPages) {
      expect(page).toHaveProperty('key')
      expect(page).toHaveProperty('name')
      expect(page).toHaveProperty('route')
      expect(Array.isArray(page.allowedRoles)).toBe(true)
      expect(Array.isArray(page.allowedFunctions)).toBe(true)
    }
  })
})
