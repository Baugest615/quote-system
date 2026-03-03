-- ============================================================
-- Migration: 開放 Member 角色新增服務類型與 KOL 服務關聯
--
-- 原因：Member 可建立 KOL 和報價項目，但無法建立服務關聯，
--       導致報價單內聯建立功能不完整（service_types / kol_services
--       的 INSERT 被 RLS 靜默擋下）。
--
-- 變更：INSERT 政策從 Admin+Editor 擴展為 Admin+Editor+Member
-- ============================================================

-- 1. service_types：加入 Member
DROP POLICY IF EXISTS "service_types_insert_editors_policy" ON "public"."service_types";
CREATE POLICY "service_types_insert_authorized_policy" ON "public"."service_types"
  FOR INSERT TO "authenticated"
  WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));

-- 2. kol_services：加入 Member
DROP POLICY IF EXISTS "kol_services_insert_editors_policy" ON "public"."kol_services";
CREATE POLICY "kol_services_insert_authorized_policy" ON "public"."kol_services"
  FOR INSERT TO "authenticated"
  WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));
