'use client';

// 直接從您的 supabase client 檔案匯入已建立好的 supabase 實例
import supabase from '@/lib/supabase/client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Image from 'next/image';

// 沿用您專案中的 UI 元件
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError('登入失敗，請檢查您的帳號或密碼。');
      console.error('Login error:', error.message);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="relative flex w-full max-w-4xl mx-auto overflow-hidden bg-white rounded-lg shadow-lg lg:h-[600px]">
        
        {/* 左側: 登入表單 */}
        <div className="flex items-center justify-center w-full px-8 py-12 lg:w-1/2">
          <div className="w-full max-w-sm">
              <div className="flex justify-center lg:justify-start">
                  {/* 請確保您的 public 資料夾中有 logo.png */}
                  <Image src="/logo.png" alt="Logo" width={48} height={48} />
              </div>
              
              <h2 className="mt-6 text-2xl font-bold text-center text-gray-800 lg:text-left">
              系統登入
              </h2>
              <p className="mt-2 text-center text-gray-600 lg:text-left">
              請輸入您的帳號以繼續
              </p>

              <form onSubmit={handleLogin} className="mt-8 space-y-6">
                  <div>
                      <label htmlFor="email" className="block mb-2 text-sm font-medium text-gray-700">
                          電子郵件
                      </label>
                      <Input
                          type="email"
                          name="email"
                          id="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="w-full"
                      />
                  </div>

                  <div>
                      <label htmlFor="password" className="block mb-2 text-sm font-medium text-gray-700">
                          密碼
                      </label>
                      <Input
                          type="password"
                          name="password"
                          id="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="w-full"
                      />
                  </div>
                  
                  {error && (
                      <p className="text-sm text-red-500">{error}</p>
                  )}

                  <Button type="submit" className="w-full !mt-8">
                      登入
                  </Button>
              </form>
          </div>
        </div>

        {/* 右側: 品牌展示 */}
        <div className="hidden lg:flex items-center justify-center w-1/2 text-white bg-gradient-to-r from-blue-500 to-blue-700">
           <div className="max-w-md text-center">
                <h1 className="text-3xl font-bold leading-tight md:text-4xl">
                    安安娛樂後臺管理系統
                </h1>
                <p className="mt-4 text-base md:text-lg text-blue-100">
                    有什麼其他的功能等法蘭奇有空再說。
                </p>
           </div>
        </div>
      </div>
    </div>
  );
}