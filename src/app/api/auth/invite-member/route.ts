import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { UserRole } from '@/types/custom.types'

interface InvitePayload {
  email: string
  role: UserRole
  name: string
  position?: string
  department?: string
  hire_date: string
}

const VALID_ROLES: UserRole[] = ['Admin', 'Editor', 'Member']

export async function POST(request: NextRequest) {
  try {
    // 1. 驗證呼叫者身份（必須是 Admin）
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '未登入' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'Admin') {
      return NextResponse.json({ error: '僅管理員可邀請新成員' }, { status: 403 })
    }

    // 2. 解析並驗證請求內容
    const body: InvitePayload = await request.json()
    const { email, role, name, position, department, hire_date } = body

    if (!email?.trim() || !name?.trim() || !hire_date) {
      return NextResponse.json({ error: '請填寫 Email、姓名和到職日' }, { status: 400 })
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: '無效的角色' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Email 格式不正確' }, { status: 400 })
    }

    // 3. 使用 Admin Client 建立帳號（發送邀請信）
    const admin = createAdminClient()

    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email.trim(),
      { redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL ? request.nextUrl.origin : 'http://localhost:3000'}/auth/login` }
    )

    if (inviteError) {
      if (inviteError.message?.includes('already been registered') || inviteError.message?.includes('already exists')) {
        return NextResponse.json({ error: '此 Email 已有帳號' }, { status: 409 })
      }
      console.error('Invite error:', inviteError)
      return NextResponse.json({ error: `邀請失敗：${inviteError.message}` }, { status: 500 })
    }

    const newUserId = inviteData.user.id

    // 4. 更新角色（handle_new_user 觸發器預設建立 Member）
    if (role !== 'Member') {
      const { error: roleError } = await admin
        .from('profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', newUserId)

      if (roleError) {
        console.error('Role update error:', roleError)
      }
    }

    // 5. 建立員工檔案並綁定帳號
    const { data: empData, error: empError } = await admin
      .from('employees')
      .insert({
        name: name.trim(),
        email: email.trim(),
        position: position?.trim() || null,
        department: department?.trim() || null,
        hire_date,
        user_id: newUserId,
        status: '在職',
        employment_type: '全職',
        base_salary: 0,
        meal_allowance: 0,
        has_labor_insurance: true,
        has_health_insurance: true,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (empError) {
      console.error('Employee insert error:', empError)
      // 帳號已建立但員工建檔失敗 — 不回滾帳號，讓管理員後續手動處理
      return NextResponse.json({
        success: true,
        userId: newUserId,
        employeeId: null,
        warning: '帳號已建立但員工建檔失敗，請至人事薪資手動新增',
      })
    }

    return NextResponse.json({
      success: true,
      userId: newUserId,
      employeeId: empData.id,
    })
  } catch (err) {
    console.error('Invite member error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
