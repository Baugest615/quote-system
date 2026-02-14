'use client'

import { useState } from 'react'
import { usePermission } from '@/lib/permissions'
import { Calculator, ChevronLeft, Plus, Trash2 } from 'lucide-react'
import AccountingLoadingGuard from '@/components/accounting/AccountingLoadingGuard'
import Link from 'next/link'

interface CalcRow {
  id: string
  label: string
  vendorBudget: number
  marginRate: number
}

const generateId = () => Math.random().toString(36).slice(2)

const defaultRow = (): CalcRow => ({
  id: generateId(),
  label: '',
  vendorBudget: 0,
  marginRate: 0.2,
})

export default function AccountingCalculatorPage() {
  const { loading: permLoading, hasRole } = usePermission()
  const [rows, setRows] = useState<CalcRow[]>([defaultRow()])
  const [taxRate] = useState(0.05)

  const updateRow = (id: string, key: keyof CalcRow, value: string | number) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r))
  }

  const addRow = () => setRows(prev => [...prev, defaultRow()])
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id))

  const calc = (row: CalcRow) => {
    const vendorBudget = row.vendorBudget || 0
    const marginRate = row.marginRate || 0
    if (vendorBudget <= 0) return null

    // 從廠商預算反推報價
    // 廠商預算 = 成本（未稅） => 報價未稅 = 成本 / (1 - 毛利率)
    const quoteUntaxed = vendorBudget / (1 - marginRate)
    const tax = quoteUntaxed * taxRate
    const invoiceTotal = quoteUntaxed + tax
    const profit = quoteUntaxed * marginRate
    const cost = quoteUntaxed * (1 - marginRate)

    return { quoteUntaxed, tax, invoiceTotal, profit, cost }
  }

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 }).format(n)

  if (permLoading) return <AccountingLoadingGuard loading={true} isAdmin={true} />
  if (!hasRole('Admin')) return <AccountingLoadingGuard loading={false} isAdmin={false} />

  const totalInvoice = rows.reduce((s, r) => { const c = calc(r); return s + (c?.invoiceTotal || 0) }, 0)
  const totalProfit = rows.reduce((s, r) => { const c = calc(r); return s + (c?.profit || 0) }, 0)
  const totalCost = rows.reduce((s, r) => { const c = calc(r); return s + (c?.cost || 0) }, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/accounting" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Calculator className="w-7 h-7 text-yellow-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">利潤試算工具</h1>
          <p className="text-sm text-gray-500">輸入廠商預算，自動換算報價與毛利</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>使用說明：</strong>輸入廠商預算（成本）和目標毛利率，系統自動計算應報給客戶的報價金額、稅額與發票總額。
        公式：報價（未稅）= 廠商預算 ÷ （1 - 毛利率）
      </div>

      {/* 試算表格 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs">
                <th className="text-left px-4 py-3 min-w-32">項目名稱</th>
                <th className="text-right px-4 py-3 min-w-32">廠商預算（未稅成本）</th>
                <th className="text-right px-4 py-3 min-w-24">目標毛利率</th>
                <th className="text-right px-4 py-3 min-w-32 bg-blue-50">報價（未稅）</th>
                <th className="text-right px-4 py-3 min-w-24 bg-blue-50">稅額（5%）</th>
                <th className="text-right px-4 py-3 min-w-32 bg-blue-50">發票總額</th>
                <th className="text-right px-4 py-3 min-w-28 bg-green-50">利潤</th>
                <th className="text-center px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const result = calc(row)
                return (
                  <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={row.label}
                        onChange={(e) => updateRow(row.id, 'label', e.target.value)}
                        placeholder="如：宏將 電子遊戲"
                        className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={row.vendorBudget || ''}
                        onChange={(e) => updateRow(row.id, 'vendorBudget', Number(e.target.value))}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={Math.round((row.marginRate || 0) * 100)}
                          onChange={(e) => updateRow(row.id, 'marginRate', Number(e.target.value) / 100)}
                          min={0}
                          max={100}
                          placeholder="20"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <span className="text-gray-400 text-xs">%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right bg-blue-50 text-blue-700 font-medium">
                      {result ? `NT$ ${fmt(result.quoteUntaxed)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right bg-blue-50 text-gray-600">
                      {result ? `NT$ ${fmt(result.tax)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right bg-blue-50 font-bold text-blue-800">
                      {result ? `NT$ ${fmt(result.invoiceTotal)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right bg-green-50 font-semibold text-green-700">
                      {result ? `NT$ ${fmt(result.profit)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {rows.length > 1 && (
                        <button onClick={() => removeRow(row.id)} className="p-1 text-gray-400 hover:text-red-500 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-sm">
                  <td className="px-4 py-3 text-gray-700" colSpan={3}>合計</td>
                  <td className="px-4 py-3 text-right text-blue-700 bg-blue-50">-</td>
                  <td className="px-4 py-3 text-right text-gray-600 bg-blue-50">-</td>
                  <td className="px-4 py-3 text-right text-blue-800 bg-blue-50">NT$ {fmt(totalInvoice)}</td>
                  <td className="px-4 py-3 text-right text-green-700 bg-green-50">NT$ {fmt(totalProfit)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100">
          <button onClick={addRow} className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors">
            <Plus className="w-4 h-4" />
            新增一列
          </button>
        </div>
      </div>

      {/* 整合摘要 */}
      {totalInvoice > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">總成本</p>
            <p className="text-xl font-bold text-gray-700">NT$ {fmt(totalCost)}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <p className="text-xs text-blue-500 mb-1">總發票金額</p>
            <p className="text-xl font-bold text-blue-700">NT$ {fmt(totalInvoice)}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <p className="text-xs text-green-500 mb-1">總利潤</p>
            <p className="text-xl font-bold text-green-700">NT$ {fmt(totalProfit)}</p>
            <p className="text-xs text-green-500">{totalInvoice > 0 ? ((totalProfit / (totalInvoice / 1.05)) * 100).toFixed(1) : 0}% 毛利率</p>
          </div>
        </div>
      )}

      {/* 毛利率參考 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-3 text-sm">毛利率參考標準</h3>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            { range: '30% 以上', color: 'bg-green-100 text-green-800 border-green-200', note: '優秀，高獲利案件' },
            { range: '15% ~ 30%', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', note: '正常，基本利潤' },
            { range: '15% 以下', color: 'bg-red-100 text-red-800 border-red-200', note: '偏低，需謹慎評估' },
          ].map(({ range, color, note }) => (
            <div key={range} className={`rounded-lg border p-3 ${color}`}>
              <p className="font-bold">{range}</p>
              <p className="text-xs mt-1 opacity-80">{note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
