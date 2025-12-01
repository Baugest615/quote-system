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
          id: string
          name: string
          tin: string | null
          invoice_title: string | null
          contact_person: string | null
          phone: string | null
          email: string | null
          address: string | null
          bank_info: {
            bankName?: string | null
            branchName?: string | null
            accountNumber?: string | null
          } | null
          contacts: any[] | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          tin?: string | null
          invoice_title?: string | null
          contact_person?: string | null
          phone?: string | null
          email?: string | null
          address?: string | null
          bank_info?: {
            bankName?: string | null
            branchName?: string | null
            accountNumber?: string | null
          } | null
          contacts?: any[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          tin?: string | null
          invoice_title?: string | null
          contact_person?: string | null
          phone?: string | null
          email?: string | null
          address?: string | null
          bank_info?: {
            bankName?: string | null
            branchName?: string | null
            accountNumber?: string | null
          } | null
          contacts?: any[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      },
      kols: {
        Row: {
          id: string
          name: string
          real_name: string | null
          type_id: string | null
          social_links: Json | null
          bank_info: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          real_name?: string | null
          type_id?: string | null
          social_links?: Json | null
          bank_info?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          real_name?: string | null
          type_id?: string | null
          social_links?: Json | null
          bank_info?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kols_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "kol_types"
            referencedColumns: ["id"]
          }
        ]
      },
      kol_services: {
        Row: {
          id: string
          kol_id: string
          service_type_id: string
          price: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          kol_id: string
          service_type_id: string
          price: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          kol_id?: string
          service_type_id?: string
          price?: number
          created_at?: string | null
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
          }
        ]
      },
      kol_types: {
        Row: {
          id: string
          name: string
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          created_at?: string | null
        }
        Relationships: []
      },
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          avatar_url: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      },
      page_permissions: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["user_role"]
          page_key: string
          page_name: string
          allowed_functions: string[]
          created_at: string | null
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          page_key: string
          page_name: string
          allowed_functions: string[]
          created_at?: string | null
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          page_key?: string
          page_name?: string
          allowed_functions?: string[]
          created_at?: string | null
        }
        Relationships: []
      },
      payment_confirmations: {
        Row: {
          id: string
          confirmation_date: string
          total_amount: number
          total_items: number
          created_by: string
          created_at: string | null
          updated_at: string | null
          remittance_settings: Json | null
        }
        Insert: {
          id?: string
          confirmation_date?: string
          total_amount?: number
          total_items?: number
          created_by: string
          created_at?: string | null
          updated_at?: string | null
          remittance_settings?: Json | null
        }
        Update: {
          id?: string
          confirmation_date?: string
          total_amount?: number
          total_items?: number
          created_by?: string
          created_at?: string | null
          updated_at?: string | null
          remittance_settings?: Json | null
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
      },
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
      },
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
          cost_amount: number | null
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
          cost_amount: number | null
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
          cost_amount: number | null
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
      },
      quotation_items: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          kol_id: string | null
          price: number
          cost: number | null // 🆕 新增成本欄位
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
          cost?: number | null // 🆕 新增成本欄位
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
          cost?: number | null // 🆕 新增成本欄位
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
      },
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
      },
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
      },
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
    },
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
      },
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
    },
    Functions: {
      get_user_role: {
        Args: { user_id: string }
        Returns: string
      },
      // 🆕 權限檢查函數
      check_page_permission: {
        Args: {
          user_id: string
          page_key: string
          required_function?: string
        }
        Returns: boolean
      },
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
      },
      // 🆕 更新匯款設定函數 (繞過 RLS)
      update_remittance_settings: {
        Args: {
          p_confirmation_id: string
          p_settings: Json
        }
        Returns: Json
      },
      // 🆕 解除合併函數
      ungroup_payment_requests: {
        Args: {
          p_group_id: string
        }
        Returns: void
      }
    },
    Enums: {
      payment_method: "電匯" | "ATM轉帳"
      quotation_status: "草稿" | "待簽約" | "已簽約" | "已歸檔"
      // 🆕 三級用戶權限（匹配您的資料庫大寫格式）
      user_role: "Admin" | "Editor" | "Member"
    },
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

// 聯絡人介面定義
export interface Contact {
  name: string
  email?: string
  phone?: string
  position?: string
  is_primary?: boolean
}

// 擴展的客戶類型，包含解析後的聯絡人
export type ClientWithParsedContacts = Database['public']['Tables']['clients']['Row'] & {
  parsedContacts: Contact[]
}