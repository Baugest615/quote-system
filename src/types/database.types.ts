export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      accounting_expenses: {
        Row: {
          accounting_subject: string | null
          amount: number | null
          created_at: string | null
          created_by: string | null
          expense_claim_id: string | null
          expense_month: string | null
          expense_type: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          note: string | null
          paid_at: string | null
          payment_confirmation_id: string | null
          payment_date: string | null
          payment_request_id: string | null
          payment_status: string | null
          payment_target_type: string | null
          project_name: string | null
          quotation_item_id: string | null
          remittance_fee: number | null
          submitted_by: string | null
          tax_amount: number | null
          total_amount: number | null
          updated_at: string | null
          vendor_name: string | null
          withholding_nhi: number
          withholding_tax: number
          year: number
        }
        Insert: {
          accounting_subject?: string | null
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          expense_claim_id?: string | null
          expense_month?: string | null
          expense_type: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          note?: string | null
          paid_at?: string | null
          payment_confirmation_id?: string | null
          payment_date?: string | null
          payment_request_id?: string | null
          payment_status?: string | null
          payment_target_type?: string | null
          project_name?: string | null
          quotation_item_id?: string | null
          remittance_fee?: number | null
          submitted_by?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_name?: string | null
          withholding_nhi?: number
          withholding_tax?: number
          year?: number
        }
        Update: {
          accounting_subject?: string | null
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          expense_claim_id?: string | null
          expense_month?: string | null
          expense_type?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          note?: string | null
          paid_at?: string | null
          payment_confirmation_id?: string | null
          payment_date?: string | null
          payment_request_id?: string | null
          payment_status?: string | null
          payment_target_type?: string | null
          project_name?: string | null
          quotation_item_id?: string | null
          remittance_fee?: number | null
          submitted_by?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_name?: string | null
          withholding_nhi?: number
          withholding_tax?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounting_expenses_expense_claim_id_fkey"
            columns: ["expense_claim_id"]
            isOneToOne: false
            referencedRelation: "expense_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_expenses_payment_confirmation_id_fkey"
            columns: ["payment_confirmation_id"]
            isOneToOne: false
            referencedRelation: "payment_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_expenses_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_expenses_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests_with_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_expenses_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_payroll: {
        Row: {
          base_salary: number | null
          bonus: number | null
          company_total: number | null
          created_at: string | null
          created_by: string | null
          deduction: number | null
          dependents_count: number | null
          employee_id: string | null
          employee_name: string
          employment_insurance_rate: number | null
          health_insurance_company: number | null
          health_insurance_personal: number | null
          health_rate: number | null
          id: string
          insurance_grade: number | null
          insurance_salary: number | null
          is_employer: boolean | null
          labor_insurance_company: number | null
          labor_insurance_personal: number | null
          labor_rate: number | null
          meal_allowance: number | null
          net_salary: number | null
          note: string | null
          paid_at: string | null
          payment_date: string | null
          payment_status: string | null
          pension_rate: number | null
          personal_total: number | null
          retirement_fund: number | null
          salary_month: string | null
          severance_fund: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          base_salary?: number | null
          bonus?: number | null
          company_total?: number | null
          created_at?: string | null
          created_by?: string | null
          deduction?: number | null
          dependents_count?: number | null
          employee_id?: string | null
          employee_name: string
          employment_insurance_rate?: number | null
          health_insurance_company?: number | null
          health_insurance_personal?: number | null
          health_rate?: number | null
          id?: string
          insurance_grade?: number | null
          insurance_salary?: number | null
          is_employer?: boolean | null
          labor_insurance_company?: number | null
          labor_insurance_personal?: number | null
          labor_rate?: number | null
          meal_allowance?: number | null
          net_salary?: number | null
          note?: string | null
          paid_at?: string | null
          payment_date?: string | null
          payment_status?: string | null
          pension_rate?: number | null
          personal_total?: number | null
          retirement_fund?: number | null
          salary_month?: string | null
          severance_fund?: number | null
          updated_at?: string | null
          year?: number
        }
        Update: {
          base_salary?: number | null
          bonus?: number | null
          company_total?: number | null
          created_at?: string | null
          created_by?: string | null
          deduction?: number | null
          dependents_count?: number | null
          employee_id?: string | null
          employee_name?: string
          employment_insurance_rate?: number | null
          health_insurance_company?: number | null
          health_insurance_personal?: number | null
          health_rate?: number | null
          id?: string
          insurance_grade?: number | null
          insurance_salary?: number | null
          is_employer?: boolean | null
          labor_insurance_company?: number | null
          labor_insurance_personal?: number | null
          labor_rate?: number | null
          meal_allowance?: number | null
          net_salary?: number | null
          note?: string | null
          paid_at?: string | null
          payment_date?: string | null
          payment_status?: string | null
          pension_rate?: number | null
          personal_total?: number | null
          retirement_fund?: number | null
          salary_month?: string | null
          severance_fund?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounting_payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_reconciliation: {
        Row: {
          bank_balance: number | null
          created_at: string | null
          created_by: string | null
          difference: number | null
          expense_total: number | null
          id: string
          income_total: number | null
          month: string
          note: string | null
          prev_bank_balance: number | null
          reconciled_at: string | null
          reconciled_by: string | null
          status: string
          updated_at: string | null
          year: number
        }
        Insert: {
          bank_balance?: number | null
          created_at?: string | null
          created_by?: string | null
          difference?: number | null
          expense_total?: number | null
          id?: string
          income_total?: number | null
          month: string
          note?: string | null
          prev_bank_balance?: number | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          status?: string
          updated_at?: string | null
          year: number
        }
        Update: {
          bank_balance?: number | null
          created_at?: string | null
          created_by?: string | null
          difference?: number | null
          expense_total?: number | null
          id?: string
          income_total?: number | null
          month?: string
          note?: string | null
          prev_bank_balance?: number | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          status?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      accounting_sales: {
        Row: {
          actual_receipt_date: string | null
          client_name: string | null
          created_at: string | null
          created_by: string | null
          id: string
          invoice_date: string | null
          invoice_month: string | null
          invoice_number: string | null
          note: string | null
          project_name: string
          quotation_id: string | null
          sales_amount: number | null
          tax_amount: number | null
          total_amount: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          actual_receipt_date?: string | null
          client_name?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_date?: string | null
          invoice_month?: string | null
          invoice_number?: string | null
          note?: string | null
          project_name: string
          quotation_id?: string | null
          sales_amount?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
          year?: number
        }
        Update: {
          actual_receipt_date?: string | null
          client_name?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_date?: string | null
          invoice_month?: string | null
          invoice_number?: string | null
          note?: string | null
          project_name?: string
          quotation_id?: string | null
          sales_amount?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounting_sales_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_subjects: {
        Row: {
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          id: number
          old_data: Json
          performed_at: string
          performed_by: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          action?: string
          id?: never
          old_data: Json
          performed_at?: string
          performed_by?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          id?: never
          old_data?: Json
          performed_at?: string
          performed_by?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          bank_info: Json | null
          contact_person: string | null
          contacts: Json
          created_at: string | null
          created_by: string | null
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
          contacts?: Json
          created_at?: string | null
          created_by?: string | null
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
          contacts?: Json
          created_at?: string | null
          created_by?: string | null
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
      employees: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_branch: string | null
          bank_name: string | null
          base_salary: number | null
          birth_date: string | null
          created_at: string | null
          created_by: string | null
          department: string | null
          dependents_count: number | null
          email: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          employee_number: string | null
          employment_type: string | null
          gender: string | null
          has_health_insurance: boolean | null
          has_labor_insurance: boolean | null
          hire_date: string
          id: string
          id_number: string | null
          insurance_grade: number | null
          is_employer: boolean | null
          meal_allowance: number | null
          name: string
          note: string | null
          phone: string | null
          position: string | null
          resignation_date: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          base_salary?: number | null
          birth_date?: string | null
          created_at?: string | null
          created_by?: string | null
          department?: string | null
          dependents_count?: number | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          employee_number?: string | null
          employment_type?: string | null
          gender?: string | null
          has_health_insurance?: boolean | null
          has_labor_insurance?: boolean | null
          hire_date: string
          id?: string
          id_number?: string | null
          insurance_grade?: number | null
          is_employer?: boolean | null
          meal_allowance?: number | null
          name: string
          note?: string | null
          phone?: string | null
          position?: string | null
          resignation_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          base_salary?: number | null
          birth_date?: string | null
          created_at?: string | null
          created_by?: string | null
          department?: string | null
          dependents_count?: number | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          employee_number?: string | null
          employment_type?: string | null
          gender?: string | null
          has_health_insurance?: boolean | null
          has_labor_insurance?: boolean | null
          hire_date?: string
          id?: string
          id_number?: string | null
          insurance_grade?: number | null
          is_employer?: boolean | null
          meal_allowance?: number | null
          name?: string
          note?: string | null
          phone?: string | null
          position?: string | null
          resignation_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      expense_claims: {
        Row: {
          accounting_subject: string | null
          amount: number
          approved_at: string | null
          approved_by: string | null
          attachment_file_path: string | null
          claim_month: string | null
          created_at: string | null
          created_by: string | null
          expense_type: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          note: string | null
          paid_at: string | null
          payment_status: string | null
          payment_target_type: string | null
          project_name: string | null
          quotation_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          tax_amount: number | null
          total_amount: number | null
          updated_at: string | null
          vendor_bank_type: string | null
          vendor_name: string | null
          withholding_month: string | null
          year: number
        }
        Insert: {
          accounting_subject?: string | null
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attachment_file_path?: string | null
          claim_month?: string | null
          created_at?: string | null
          created_by?: string | null
          expense_type?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          note?: string | null
          paid_at?: string | null
          payment_status?: string | null
          payment_target_type?: string | null
          project_name?: string | null
          quotation_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_bank_type?: string | null
          vendor_name?: string | null
          withholding_month?: string | null
          year?: number
        }
        Update: {
          accounting_subject?: string | null
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attachment_file_path?: string | null
          claim_month?: string | null
          created_at?: string | null
          created_by?: string | null
          expense_type?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          note?: string | null
          paid_at?: string | null
          payment_status?: string | null
          payment_target_type?: string | null
          project_name?: string | null
          quotation_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_bank_type?: string | null
          vendor_name?: string | null
          withholding_month?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_claims_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_submitted_by_profiles_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_submitted_by_profiles_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "user_permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_types: {
        Row: {
          created_at: string | null
          default_subject: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          default_subject?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          default_subject?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      insurance_rate_tables: {
        Row: {
          created_at: string | null
          effective_date: string
          employment_insurance_rate: number | null
          employment_stabilization_rate: number | null
          expiry_date: string | null
          grade: number
          health_rate_company: number | null
          health_rate_employee: number | null
          health_rate_government: number | null
          health_rate_total: number | null
          id: string
          labor_rate_company: number | null
          labor_rate_employee: number | null
          labor_rate_government: number | null
          labor_rate_total: number | null
          monthly_salary: number
          note: string | null
          occupational_injury_rate: number | null
          pension_rate_company: number | null
          pension_rate_employee: number | null
          supplementary_rate: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          effective_date: string
          employment_insurance_rate?: number | null
          employment_stabilization_rate?: number | null
          expiry_date?: string | null
          grade: number
          health_rate_company?: number | null
          health_rate_employee?: number | null
          health_rate_government?: number | null
          health_rate_total?: number | null
          id?: string
          labor_rate_company?: number | null
          labor_rate_employee?: number | null
          labor_rate_government?: number | null
          labor_rate_total?: number | null
          monthly_salary: number
          note?: string | null
          occupational_injury_rate?: number | null
          pension_rate_company?: number | null
          pension_rate_employee?: number | null
          supplementary_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          effective_date?: string
          employment_insurance_rate?: number | null
          employment_stabilization_rate?: number | null
          expiry_date?: string | null
          grade?: number
          health_rate_company?: number | null
          health_rate_employee?: number | null
          health_rate_government?: number | null
          health_rate_total?: number | null
          id?: string
          labor_rate_company?: number | null
          labor_rate_employee?: number | null
          labor_rate_government?: number | null
          labor_rate_total?: number | null
          monthly_salary?: number
          note?: string | null
          occupational_injury_rate?: number | null
          pension_rate_company?: number | null
          pension_rate_employee?: number | null
          supplementary_rate?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      insurance_settings: {
        Row: {
          default_dependents: number
          effective_date: string
          expiry_date: string | null
          id: string
          note: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          default_dependents?: number
          effective_date?: string
          expiry_date?: string | null
          id?: string
          note?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          default_dependents?: number
          effective_date?: string
          expiry_date?: string | null
          id?: string
          note?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      kol_services: {
        Row: {
          cost: number
          created_at: string | null
          id: string
          kol_id: string | null
          last_quote_info: string | null
          price: number
          service_type_id: string | null
          updated_at: string | null
        }
        Insert: {
          cost?: number
          created_at?: string | null
          id?: string
          kol_id?: string | null
          last_quote_info?: string | null
          price?: number
          service_type_id?: string | null
          updated_at?: string | null
        }
        Update: {
          cost?: number
          created_at?: string | null
          id?: string
          kol_id?: string | null
          last_quote_info?: string | null
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
          created_by: string | null
          id: string
          name: string
          real_name: string | null
          social_links: Json | null
          type_id: string | null
          updated_at: string | null
          withholding_exempt: boolean | null
          withholding_exempt_reason: string | null
        }
        Insert: {
          bank_info?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          real_name?: string | null
          social_links?: Json | null
          type_id?: string | null
          updated_at?: string | null
          withholding_exempt?: boolean | null
          withholding_exempt_reason?: string | null
        }
        Update: {
          bank_info?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          real_name?: string | null
          social_links?: Json | null
          type_id?: string | null
          updated_at?: string | null
          withholding_exempt?: boolean | null
          withholding_exempt_reason?: string | null
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
      page_permissions: {
        Row: {
          allowed_functions: string[] | null
          allowed_roles: Database["public"]["Enums"]["user_role"][]
          created_at: string
          id: string
          page_key: string
          page_name: string
          updated_at: string
        }
        Insert: {
          allowed_functions?: string[] | null
          allowed_roles: Database["public"]["Enums"]["user_role"][]
          created_at?: string
          id?: string
          page_key: string
          page_name: string
          updated_at?: string
        }
        Update: {
          allowed_functions?: string[] | null
          allowed_roles?: Database["public"]["Enums"]["user_role"][]
          created_at?: string
          id?: string
          page_key?: string
          page_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_confirmation_items: {
        Row: {
          amount_at_confirmation: number
          created_at: string | null
          expense_claim_id: string | null
          id: string
          kol_name_at_confirmation: string
          payment_confirmation_id: string
          payment_request_id: string | null
          project_name_at_confirmation: string
          quotation_item_id: string | null
          service_at_confirmation: string
          source_type: string | null
        }
        Insert: {
          amount_at_confirmation: number
          created_at?: string | null
          expense_claim_id?: string | null
          id?: string
          kol_name_at_confirmation: string
          payment_confirmation_id: string
          payment_request_id?: string | null
          project_name_at_confirmation: string
          quotation_item_id?: string | null
          service_at_confirmation: string
          source_type?: string | null
        }
        Update: {
          amount_at_confirmation?: number
          created_at?: string | null
          expense_claim_id?: string | null
          id?: string
          kol_name_at_confirmation?: string
          payment_confirmation_id?: string
          payment_request_id?: string | null
          project_name_at_confirmation?: string
          quotation_item_id?: string | null
          service_at_confirmation?: string
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_confirmation_items_expense_claim_id_fkey"
            columns: ["expense_claim_id"]
            isOneToOne: false
            referencedRelation: "expense_claims"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "payment_confirmation_items_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests_with_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_confirmation_items_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_confirmations: {
        Row: {
          confirmation_date: string
          created_at: string | null
          created_by: string
          id: string
          remittance_settings: Json | null
          total_amount: number
          total_items: number
          updated_at: string | null
        }
        Insert: {
          confirmation_date?: string
          created_at?: string | null
          created_by: string
          id?: string
          remittance_settings?: Json | null
          total_amount?: number
          total_items?: number
          updated_at?: string | null
        }
        Update: {
          confirmation_date?: string
          created_at?: string | null
          created_by?: string
          id?: string
          remittance_settings?: Json | null
          total_amount?: number
          total_items?: number
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
          {
            foreignKeyName: "payment_confirmations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          accounting_subject: string | null
          approved_at: string | null
          approved_by: string | null
          attachment_file_path: string | null
          cost_amount: number | null
          created_at: string | null
          created_by: string | null
          expected_payment_month: string | null
          expense_type: string | null
          id: string
          invoice_number: string | null
          is_merge_leader: boolean | null
          merge_color: string | null
          merge_group_id: string | null
          merge_type: string | null
          quotation_item_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          request_date: string | null
          updated_at: string | null
          verification_status: string | null
        }
        Insert: {
          accounting_subject?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachment_file_path?: string | null
          cost_amount?: number | null
          created_at?: string | null
          created_by?: string | null
          expected_payment_month?: string | null
          expense_type?: string | null
          id?: string
          invoice_number?: string | null
          is_merge_leader?: boolean | null
          merge_color?: string | null
          merge_group_id?: string | null
          merge_type?: string | null
          quotation_item_id: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          request_date?: string | null
          updated_at?: string | null
          verification_status?: string | null
        }
        Update: {
          accounting_subject?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachment_file_path?: string | null
          cost_amount?: number | null
          created_at?: string | null
          created_by?: string | null
          expected_payment_month?: string | null
          expense_type?: string | null
          id?: string
          invoice_number?: string | null
          is_merge_leader?: boolean | null
          merge_color?: string | null
          merge_group_id?: string | null
          merge_type?: string | null
          quotation_item_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          request_date?: string | null
          updated_at?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "user_permissions"
            referencedColumns: ["id"]
          },
        ]
      }
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
        Relationships: []
      }
      project_notes: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          project_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget_with_tax: number | null
          client_id: string | null
          client_name: string
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          project_name: string
          project_type: string
          quotation_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          budget_with_tax?: number | null
          client_id?: string | null
          client_name: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          project_name: string
          project_type?: string
          quotation_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          budget_with_tax?: number | null
          client_id?: string | null
          client_name?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          project_name?: string
          project_type?: string
          quotation_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          accounting_subject: string | null
          approved_at: string | null
          approved_by: string | null
          attachments: Json | null
          category: string | null
          cost: number | null
          cost_amount: number | null
          created_at: string | null
          created_by: string | null
          expected_payment_month: string | null
          expense_type: string | null
          id: string
          invoice_number: string | null
          is_merge_leader: boolean | null
          is_supplement: boolean
          kol_id: string | null
          merge_color: string | null
          merge_group_id: string | null
          price: number
          quantity: number | null
          quotation_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          remark: string | null
          remittance_name: string | null
          requested_at: string | null
          requested_by: string | null
          service: string
        }
        Insert: {
          accounting_subject?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachments?: Json | null
          category?: string | null
          cost?: number | null
          cost_amount?: number | null
          created_at?: string | null
          created_by?: string | null
          expected_payment_month?: string | null
          expense_type?: string | null
          id?: string
          invoice_number?: string | null
          is_merge_leader?: boolean | null
          is_supplement?: boolean
          kol_id?: string | null
          merge_color?: string | null
          merge_group_id?: string | null
          price?: number
          quantity?: number | null
          quotation_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          remark?: string | null
          remittance_name?: string | null
          requested_at?: string | null
          requested_by?: string | null
          service: string
        }
        Update: {
          accounting_subject?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachments?: Json | null
          category?: string | null
          cost?: number | null
          cost_amount?: number | null
          created_at?: string | null
          created_by?: string | null
          expected_payment_month?: string | null
          expense_type?: string | null
          id?: string
          invoice_number?: string | null
          is_merge_leader?: boolean | null
          is_supplement?: boolean
          kol_id?: string | null
          merge_color?: string | null
          merge_group_id?: string | null
          price?: number
          quantity?: number | null
          quotation_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          remark?: string | null
          remittance_name?: string | null
          requested_at?: string | null
          requested_by?: string | null
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
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          created_by: string | null
          discounted_price: number | null
          grand_total_taxed: number | null
          has_discount: boolean | null
          id: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          project_name: string
          quote_number: string | null
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
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          discounted_price?: number | null
          grand_total_taxed?: number | null
          has_discount?: boolean | null
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_name: string
          quote_number?: string | null
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
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          discounted_price?: number | null
          grand_total_taxed?: number | null
          has_discount?: boolean | null
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_name?: string
          quote_number?: string | null
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
      quote_number_counters: {
        Row: {
          last_number: number
          year: number
        }
        Insert: {
          last_number?: number
          year: number
        }
        Update: {
          last_number?: number
          year?: number
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
      withholding_settings: {
        Row: {
          effective_date: string
          expiry_date: string | null
          id: string
          income_tax_rate: number
          income_tax_threshold: number
          nhi_supplement_rate: number
          nhi_threshold: number
          remittance_fee_default: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          effective_date?: string
          expiry_date?: string | null
          id?: string
          income_tax_rate?: number
          income_tax_threshold?: number
          nhi_supplement_rate?: number
          nhi_threshold?: number
          remittance_fee_default?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          effective_date?: string
          expiry_date?: string | null
          id?: string
          income_tax_rate?: number
          income_tax_threshold?: number
          nhi_supplement_rate?: number
          nhi_threshold?: number
          remittance_fee_default?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      withholding_settlements: {
        Row: {
          amount: number
          created_at: string | null
          expense_claim_id: string | null
          id: string
          month: string
          note: string | null
          settled_at: string | null
          settled_by: string | null
          settlement_method: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          expense_claim_id?: string | null
          id?: string
          month: string
          note?: string | null
          settled_at?: string | null
          settled_by?: string | null
          settlement_method?: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          expense_claim_id?: string | null
          id?: string
          month?: string
          note?: string | null
          settled_at?: string | null
          settled_by?: string | null
          settlement_method?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "withholding_settlements_expense_claim_id_fkey"
            columns: ["expense_claim_id"]
            isOneToOne: false
            referencedRelation: "expense_claims"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      accounting_annual_summary: {
        Row: {
          annual_profit: number | null
          total_labor_expenses: number | null
          total_operation_expenses: number | null
          total_other_expenses: number | null
          total_outsource_expenses: number | null
          total_payroll: number | null
          total_project_expenses: number | null
          total_reimbursement_expenses: number | null
          total_sales: number | null
          total_sales_tax: number | null
          total_sales_with_tax: number | null
          total_writeoff_expenses: number | null
          year: number | null
        }
        Relationships: []
      }
      payment_requests_with_details: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attachment_file_path: string | null
          category: string | null
          client_name: string | null
          cost_amount: number | null
          created_at: string | null
          id: string | null
          invoice_number: string | null
          is_merge_leader: boolean | null
          kol_bank_info: Json | null
          kol_name: string | null
          kol_real_name: string | null
          merge_color: string | null
          merge_group_id: string | null
          merge_type: string | null
          price: number | null
          project_name: string | null
          quantity: number | null
          quotation_item_id: string | null
          quotation_status:
            | Database["public"]["Enums"]["quotation_status"]
            | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          remark: string | null
          request_date: string | null
          service: string | null
          updated_at: string | null
          verification_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "user_permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          allowed_functions: string[] | null
          email: string | null
          id: string | null
          page_key: string | null
          page_name: string | null
          role: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_expense_claim: {
        Args: { approver_id?: string; claim_id: string }
        Returns: undefined
      }
      approve_merge_group: { Args: { p_group_id: string }; Returns: undefined }
      approve_payment_request: {
        Args: {
          p_accounting_subject?: string
          p_expense_type?: string
          request_id: string
          verifier_id: string
        }
        Returns: undefined
      }
      approve_quotation_item: {
        Args: {
          p_accounting_subject?: string
          p_expense_type?: string
          p_item_id: string
        }
        Returns: string
      }
      auto_close_projects: { Args: never; Returns: undefined }
      check_page_permission: {
        Args: { page_key: string; required_function?: string; user_id: string }
        Returns: boolean
      }
      create_accounting_sale_from_quotation: {
        Args: { p_quotation_id: string; p_user_id: string }
        Returns: string
      }
      create_payment_confirmation: {
        Args: {
          p_confirmation_date: string
          p_created_by: string
          p_items: Json
          p_total_amount: number
          p_total_items: number
        }
        Returns: Json
      }
      create_payment_request_group: {
        Args: { p_merge_type: string; p_quotation_item_ids: string[] }
        Returns: undefined
      }
      create_quotation_merge_group: {
        Args: {
          p_item_ids: string[]
          p_leader_id: string
          p_payment_month?: string
        }
        Returns: string
      }
      dissolve_quotation_merge_group: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      get_available_pending_payments: {
        Args: never
        Returns: {
          category: string
          cost: number
          created_at: string
          id: string
          kol_id: string
          kols: Json
          price: number
          quantity: number
          quotation_id: string
          quotations: Json
          remark: string
          service: string
        }[]
      }
      get_merge_group_items: {
        Args: { group_id: string }
        Returns: {
          kol_name: string
          payment_request_id: string
          project_name: string
          quotation_item_id: string
          service: string
          total_amount: number
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }[]
      }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_project_notes: {
        Args: { p_project_id: string }
        Returns: {
          author_email: string
          content: string
          created_at: string
          created_by: string
          id: string
          project_id: string
        }[]
      }
      get_project_notes_count: {
        Args: never
        Returns: {
          notes_count: number
          project_id: string
        }[]
      }
      get_user_role: { Args: { user_id: string }; Returns: string }
      get_workbench_items: {
        Args: never
        Returns: {
          accounting_subject: string
          approved_at: string
          approved_by: string
          attachments: Json
          category: string
          client_name: string
          cost: number
          cost_amount: number
          created_at: string
          expected_payment_month: string
          expense_type: string
          id: string
          invoice_number: string
          is_merge_leader: boolean
          kol_bank_info: Json
          kol_id: string
          kol_name: string
          merge_color: string
          merge_group_id: string
          price: number
          project_name: string
          quantity: number
          quotation_id: string
          rejected_at: string
          rejected_by: string
          rejection_reason: string
          remark: string
          remittance_name: string
          requested_at: string
          requested_by: string
          service: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      process_payment_confirmation: {
        Args: { p_approved_request_ids: string[]; p_user_id: string }
        Returns: {
          confirmation_id: string
          items_processed: number
          message: string
          success: boolean
        }[]
      }
      reject_expense_claim: {
        Args: { claim_id: string; reason?: string; rejector_id?: string }
        Returns: undefined
      }
      reject_merge_group: {
        Args: { p_group_id: string; p_reason?: string }
        Returns: undefined
      }
      reject_quotation_item: {
        Args: { p_item_id: string; p_reason?: string }
        Returns: undefined
      }
      remove_accounting_sale_for_quotation: {
        Args: { p_quotation_id: string }
        Returns: undefined
      }
      revert_quotation_item: {
        Args: { p_item_id: string; p_reason?: string }
        Returns: undefined
      }
      submit_merge_group: { Args: { p_group_id: string }; Returns: undefined }
      submit_single_item: { Args: { p_item_id: string }; Returns: undefined }
      sync_kol_service_prices_from_quotation: {
        Args: { p_quotation_id: string }
        Returns: Json
      }
      sync_kol_service_prices_initial: { Args: never; Returns: Json }
      ungroup_payment_requests: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      update_remittance_settings: {
        Args: { p_confirmation_id: string; p_settings: Json }
        Returns: Json
      }
      withdraw_merge_group: { Args: { p_group_id: string }; Returns: undefined }
      withdraw_single_item: { Args: { p_item_id: string }; Returns: undefined }
    }
    Enums: {
      payment_method: "電匯" | "ATM轉帳"
      quotation_status: "草稿" | "待簽約" | "已簽約" | "已歸檔"
      user_role: "admin" | "member" | "Admin" | "Editor" | "Member" | "Reader"
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

export const Constants = {
  public: {
    Enums: {
      payment_method: ["電匯", "ATM轉帳"],
      quotation_status: ["草稿", "待簽約", "已簽約", "已歸檔"],
      user_role: ["admin", "member", "Admin", "Editor", "Member", "Reader"],
    },
  },
} as const
