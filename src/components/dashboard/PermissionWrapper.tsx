'use client'

import { PermissionProvider } from '@/lib/permissions'

export function PermissionWrapper({ children }: { children: React.ReactNode }) {
  return <PermissionProvider>{children}</PermissionProvider>
}
