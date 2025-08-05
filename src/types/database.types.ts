// 完整的 src/types/database.types.ts - 三級權限系統版本

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          address: string | null
          bank_info: Json | null
          contact_person: string | null
          created_at: string | null
          email: string | null
          id: string
          invoice_title: string | null
          name: string
          phone: string | null
          tin: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          bank_info?: Json | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          invoice_title?: string | null
          name: string
          phone?: string | null
          tin?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          bank_info?: Json | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          invoice_title?: string | null
          name?: string
          phone?: string | null
          tin?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      kol_services: {
        Row: {
          created_at: string | null
          id: string
          kol_id: string | null
          price: number
          service_type_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          kol_id?: string | null
          price?: number
          service_type_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          kol_id?: string | null
          price?: number
          service_type_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kol_services_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: false
            referencedRelation: "kols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kol_services_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      kol_types: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      kols: {
        Row: {
          bank_info: Json | null
          created_at: string | null
          id: string
          name: string
          real_name: string | null
          social_links: Json | null
          type_id: string | null
          updated_at: string | null
        }
        Insert: {
          bank_info?: Json | null
          created_at?: string | null
          id?: string
          name: string
          real_name?: string | null
          social_links?: Json | null
          type_id?: string | null
          updated_at?: string | null
        }
        Update: {
          bank_info?: Json | null
          created_at?: string | null
          id?: string
          name?: string
          real_name?: string | null
          social_links?: Json | null
          type_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kols_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "kol_types"
            referencedColumns: ["id"]
          },
        ]
      }
      // 🆕 頁面權限配置表
      page_permissions: {
        Row: {
          id: string
          page_key: string
          page_name: string
          allowed_roles: Database["public"]["Enums"]["user_role"][]
          allowed_functions: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          page_key: string
          page_name: string
          allowed_roles: Database["public"]["Enums"]["user_role"][]
          allowed_functions?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          page_key?: string
          page_name?: string
          allowed_roles?: Database["public"]["Enums"]["user_role"][]
          allowed_functions?: string[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // 🆕 請款確認主表
      payment_confirmations: {
        Row: {
          id: string
          confirmation_date: string
          total_amount: number
          total_items: number
          created_by: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          confirmation_date?: string
          total_amount?: number
          total_items?: number
          created_by: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          confirmation_date?: string
          total_amount?: number
          total_items?: number
          created_by?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_confirmations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      // 🆕 請款確認項目關聯表
      payment_confirmation_items: {
        Row: {
          id: string
          payment_confirmation_id: string
          payment_request_id: string
          amount_at_confirmation: number
          kol_name_at_confirmation: string
          project_name_at_confirmation: string
          service_at_confirmation: string
          created_at: string | null
        }
        Insert: {
          id?: string
          payment_confirmation_id: string
          payment_request_id: string
          amount_at_confirmation: number
          kol_name_at_confirmation: string
          project_name_at_confirmation: string
          service_at_confirmation: string
          created_at?: string | null
        }
        Update: {
          id?: string
          payment_confirmation_id?: string
          payment_request_id?: string
          amount_at_confirmation?: number
          kol_name_at_confirmation?: string
          project_name_at_confirmation?: string
          service_at_confirmation?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_confirmation_items_payment_confirmation_id_fkey"
            columns: ["payment_confirmation_id"]
            isOneToOne: false
            referencedRelation: "payment_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_confirmation_items_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      // 🆕 請款申請表
      payment_requests: {
        Row: {
          id: string
          quotation_item_id: string
          request_date: string | null
          verification_status: 'pending' | 'approved' | 'rejected' | 'confirmed'
          merge_type: 'company' | 'account' | null
          merge_group_id: string | null
          is_merge_leader: boolean
          merge_color: string | null
          attachment_file_path: string | null
          invoice_number: string | null
          approved_by: string | null
          approved_at: string | null
          rejected_by: string | null
          rejected_at: string | null
          rejection_reason: string | null
          cost_amount: number | null // 【NEW】新增成本金額欄位
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          quotation_item_id: string
          request_date?: string | null
          verification_status?: 'pending' | 'approved' | 'rejected' | 'confirmed'
          merge_type?: 'company' | 'account' | null
          merge_group_id?: string | null
          is_merge_leader?: boolean
          merge_color?: string | null
          attachment_file_path?: string | null
          invoice_number?: string | null
          approved_by?: string | null
          approved_at?: string | null
          rejected_by?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          cost_amount: number | null // 【NEW】新增成本金額欄位
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          quotation_item_id?: string
          request_date?: string | null
          verification_status?: 'pending' | 'approved' | 'rejected' | 'confirmed'
          merge_type?: 'company' | 'account' | null
          merge_group_id?: string | null
          is_merge_leader?: boolean
          merge_color?: string | null
          attachment_file_path?: string | null
          invoice_number?: string | null
          approved_by?: string | null
          approved_at?: string | null
          rejected_by?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          cost_amount: number | null // 【NEW】新增成本金額欄位
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      // 用戶資料表 (注意：使用 profiles 而不是 users)
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      quotation_items: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          kol_id: string | null
          price: number
          quantity: number
          quotation_id: string | null
          remark: string | null
          service: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          kol_id?: string | null
          price?: number
          quantity?: number
          quotation_id?: string | null
          remark?: string | null
          service: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          kol_id?: string | null
          price?: number
          quantity?: number
          quotation_id?: string | null
          remark?: string | null
          service?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: false
            referencedRelation: "kols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          attachments: Json[] | null
          client_contact: string | null
          client_id: string | null
          created_at: string | null
          discounted_price: number | null
          grand_total_taxed: number | null
          has_discount: boolean | null
          id: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          project_name: string
          remarks: string | null
          status: Database["public"]["Enums"]["quotation_status"] | null
          subtotal_untaxed: number | null
          tax: number | null
          terms: string | null
          updated_at: string | null
        }
        Insert: {
          attachments?: Json[] | null
          client_contact?: string | null
          client_id?: string | null
          created_at?: string | null
          discounted_price?: number | null
          grand_total_taxed?: number | null
          has_discount?: boolean | null
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_name: string
          remarks?: string | null
          status?: Database["public"]["Enums"]["quotation_status"] | null
          subtotal_untaxed?: number | null
          tax?: number | null
          terms?: string | null
          updated_at?: string | null
        }
        Update: {
          attachments?: Json[] | null
          client_contact?: string | null
          client_id?: string | null
          created_at?: string | null
          discounted_price?: number | null
          grand_total_taxed?: number | null
          has_discount?: boolean | null
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_name?: string
          remarks?: string | null
          status?: Database["public"]["Enums"]["quotation_status"] | null
          subtotal_untaxed?: number | null
          tax?: number | null
          terms?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      service_types: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      // 🆕 請款申請詳細視圖
      payment_requests_with_details: {
        Row: {
          id: string
          quotation_item_id: string
          request_date: string | null
          verification_status: 'pending' | 'approved' | 'rejected' | 'confirmed'
          merge_type: 'company' | 'account' | null
          merge_group_id: string | null
          is_merge_leader: boolean
          merge_color: string | null
          attachment_file_path: string | null
          invoice_number: string | null
          approved_by: string | null
          approved_at: string | null
          rejected_by: string | null
          rejected_at: string | null
          rejection_reason: string | null
          service: string
          quantity: number
          price: number
          cost_amount: number | null // 【NEW】新增成本金額欄位
          category: string | null
          remark: string | null
          project_name: string
          quotation_status: Database["public"]["Enums"]["quotation_status"] | null
          kol_name: string | null
          kol_real_name: string | null
          kol_bank_info: Json | null
          client_name: string | null
          created_at: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      // 🆕 用戶權限視圖
      user_permissions: {
        Row: {
          id: string
          email: string
          role: Database["public"]["Enums"]["user_role"] | null
          page_key: string
          page_name: string
          allowed_functions: string[]
        }
        Relationships: []
      }
    }
    Functions: {
      get_user_role: {
        Args: { user_id: string }
        Returns: string
      }
      // 🆕 權限檢查函數
      check_page_permission: {
        Args: { 
          user_id: string
          page_key: string
          required_function?: string
        }
        Returns: boolean
      }
      // 🆕 取得合併群組項目函數
      get_merge_group_items: {
        Args: { group_id: string }
        Returns: {
          payment_request_id: string
          quotation_item_id: string
          kol_name: string | null
          project_name: string
          service: string
          total_amount: number
        }[]
      }
    }
    Enums: {
      payment_method: "電匯" | "ATM轉帳"
      quotation_status: "草稿" | "待簽約" | "已簽約" | "已歸檔"
      // 🆕 三級用戶權限（匹配您的資料庫大寫格式）
      user_role: "Admin" | "Editor" | "Member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

// 🆕 權限相關的類型定義
export type UserRole = Database["public"]["Enums"]["user_role"]
export type PagePermission = Database["public"]["Tables"]["page_permissions"]["Row"]

// 🆕 頁面權限配置
export interface PageConfig {
  key: string
  name: string
  allowedRoles: UserRole[]
  allowedFunctions: string[]
  route: string
  icon?: string
}

// 🆕 權限檢查結果
export interface PermissionCheckResult {
  hasAccess: boolean
  allowedFunctions: string[]
  userRole: UserRole | null
}

// 🆕 常量定義（匹配您的大寫枚舉值）
export const USER_ROLES = {
  ADMIN: 'Admin' as const,
  EDITOR: 'Editor' as const,
  MEMBER: 'Member' as const,
} as const

export const PAGE_KEYS = {
  DASHBOARD: 'dashboard',
  CLIENTS: 'clients',
  KOLS: 'kols',
  QUOTES: 'quotes',
  REPORTS: 'reports',
  PENDING_PAYMENTS: 'pending_payments',
  PAYMENT_REQUESTS: 'payment_requests',
  CONFIRMED_PAYMENTS: 'confirmed_payments',
  SETTINGS: 'settings',
} as const

// 🆕 頁面權限配置（使用大寫角色名稱）
export const PAGE_PERMISSIONS: Record<string, PageConfig> = {
  [PAGE_KEYS.DASHBOARD]: {
    key: PAGE_KEYS.DASHBOARD,
    name: '儀表板',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['view_statistics', 'view_reports'],
    route: '/dashboard',
    icon: 'BarChart3'
  },
  [PAGE_KEYS.CLIENTS]: {
    key: PAGE_KEYS.CLIENTS,
    name: '客戶管理',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['create', 'read', 'update', 'delete', 'export'],
    route: '/dashboard/clients',
    icon: 'Users'
  },
  [PAGE_KEYS.KOLS]: {
    key: PAGE_KEYS.KOLS,
    name: 'KOL管理',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['create', 'read', 'update', 'delete', 'export'],
    route: '/dashboard/kols',
    icon: 'Star'
  },
  [PAGE_KEYS.QUOTES]: {
    key: PAGE_KEYS.QUOTES,
    name: '報價單',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['create', 'read', 'update', 'delete', 'export_pdf'],
    route: '/dashboard/quotes',
    icon: 'FileText'
  },
  [PAGE_KEYS.REPORTS]: {
    key: PAGE_KEYS.REPORTS,
    name: '報表分析',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['view', 'export', 'analysis'],
    route: '/dashboard/reports',
    icon: 'TrendingUp'
  },
  [PAGE_KEYS.PENDING_PAYMENTS]: {
    key: PAGE_KEYS.PENDING_PAYMENTS,
    name: '待請款管理',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['create', 'read', 'update', 'submit'],
    route: '/dashboard/pending-payments',
    icon: 'Clock'
  },
  [PAGE_KEYS.PAYMENT_REQUESTS]: {
    key: PAGE_KEYS.PAYMENT_REQUESTS,
    name: '請款申請',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR],
    allowedFunctions: ['review', 'approve', 'reject', 'batch_process'],
    route: '/dashboard/payment-requests',
    icon: 'CheckCircle'
  },
  [PAGE_KEYS.CONFIRMED_PAYMENTS]: {
    key: PAGE_KEYS.CONFIRMED_PAYMENTS,
    name: '已確認請款清單',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR],
    allowedFunctions: ['view', 'export', 'return'],
    route: '/dashboard/confirmed-payments',
    icon: 'FileCheck'
  },
  [PAGE_KEYS.SETTINGS]: {
    key: PAGE_KEYS.SETTINGS,
    name: '系統設定',
    allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.EDITOR, USER_ROLES.MEMBER],
    allowedFunctions: ['view', 'update_profile', 'manage_users'],
    route: '/dashboard/settings',
    icon: 'Settings'
  },
}

// 🆕 權限檢查輔助函數類型
export type PermissionChecker = {
  checkPageAccess: (pageKey: string, userRole?: UserRole) => boolean
  checkFunctionAccess: (pageKey: string, functionName: string, userRole?: UserRole) => boolean
  getAllowedPages: (userRole: UserRole) => PageConfig[]
  hasRole: (requiredRole: UserRole, userRole?: UserRole) => boolean
}

// 更新常量定義以匹配大寫枚舉值
export const Constants = {
  public: {
    Enums: {
      payment_method: ["電匯", "ATM轉帳"],
      quotation_status: ["草稿", "待簽約", "已簽約", "已歸檔"],
      user_role: ["Admin", "Editor", "Member"],
    },
  },
} as const