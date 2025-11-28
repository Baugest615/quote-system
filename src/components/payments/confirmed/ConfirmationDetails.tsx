import { Building2, FileText, User, Calculator } from 'lucide-react'
import { PaymentConfirmation } from '@/lib/payments/types'
import { groupItemsByRemittance } from '@/lib/payments/grouping'
import { PaymentRecordRow } from './PaymentRecordRow'
import { RemittanceSettings } from '@/lib/payments/types'

interface ConfirmationDetailsProps {
    confirmation: PaymentConfirmation
    settings: RemittanceSettings
    updateSettings: (remittanceName: string, updates: Partial<RemittanceSettings[string]>) => void
    getSettings: (remittanceName: string) => RemittanceSettings[string]
}

export function ConfirmationDetails({ confirmation, settings, updateSettings, getSettings }: ConfirmationDetailsProps) {
    const remittanceGroups = groupItemsByRemittance(confirmation.payment_confirmation_items)

    if (remittanceGroups.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500">
                <FileText className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                <p>此確認記錄沒有關聯的項目</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 p-4">
            {remittanceGroups.map((group, groupIndex) => {
                const settings = getSettings(group.remittanceName)

                // 計算邏輯
                const subtotal = group.totalAmount
                const tax = settings.hasTax ? Math.floor(subtotal * 0.1) : 0
                const insurance = settings.hasInsurance ? Math.floor(subtotal * 0.0211) : 0
                const fee = settings.hasRemittanceFee ? settings.remittanceFeeAmount : 0
                const netTotal = subtotal - tax - insurance - fee

                return (
                    <div key={groupIndex} className="border rounded-lg overflow-hidden shadow-sm bg-white">
                        {/* 匯款戶名標題與設定區 */}
                        <div className="bg-blue-50 border-b p-4">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                {/* 左側：基本資訊 */}
                                <div className="flex items-start space-x-3">
                                    <User className="h-6 w-6 text-blue-600 mt-1" />
                                    <div>
                                        <div className="font-semibold text-lg text-gray-900">
                                            {group.remittanceName}
                                        </div>
                                        <div className="text-sm text-gray-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                            {group.bankName && (
                                                <span><span className="font-medium">銀行:</span> {group.bankName}</span>
                                            )}
                                            {group.branchName && (
                                                <span><span className="font-medium">分行:</span> {group.branchName}</span>
                                            )}
                                            {group.accountNumber && (
                                                <span><span className="font-medium">帳號:</span> {group.accountNumber}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* 右側：付款試算設定 */}
                                <div className="bg-white/60 rounded-lg p-3 border border-blue-100">
                                    <div className="flex items-center gap-2 mb-2 text-blue-800 font-medium text-sm">
                                        <Calculator className="h-4 w-4" />
                                        付款試算設定
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4 text-sm">
                                        {/* 匯費設定 */}
                                        <label className="flex items-center gap-2 cursor-pointer hover:text-blue-700 transition-colors">
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                checked={settings.hasRemittanceFee}
                                                onChange={(e) => updateSettings(group.remittanceName, { hasRemittanceFee: e.target.checked })}
                                            />
                                            <span>匯費自付 (扣除)</span>
                                        </label>
                                        {settings.hasRemittanceFee && (
                                            <div className="flex items-center gap-1">
                                                <span className="text-gray-500">$</span>
                                                <input
                                                    type="number"
                                                    className="w-16 h-7 text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 px-2 py-0"
                                                    value={settings.remittanceFeeAmount}
                                                    onChange={(e) => updateSettings(group.remittanceName, { remittanceFeeAmount: Number(e.target.value) })}
                                                />
                                            </div>
                                        )}

                                        <div className="w-px h-4 bg-gray-300 mx-1 hidden md:block"></div>

                                        {/* 稅務設定 */}
                                        <label className="flex items-center gap-2 cursor-pointer hover:text-blue-700 transition-colors">
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                checked={settings.hasTax}
                                                onChange={(e) => updateSettings(group.remittanceName, { hasTax: e.target.checked })}
                                            />
                                            <span>代扣所得稅 (10%)</span>
                                        </label>

                                        <label className="flex items-center gap-2 cursor-pointer hover:text-blue-700 transition-colors">
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                checked={settings.hasInsurance}
                                                onChange={(e) => updateSettings(group.remittanceName, { hasInsurance: e.target.checked })}
                                            />
                                            <span>代扣二代健保 (2.11%)</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 項目列表 */}
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">專案名稱</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KOL</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">服務項目</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">匯款戶名</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">匯款金額</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {group.items.map((item) => (
                                        <PaymentRecordRow key={item.id} item={item} />
                                    ))}
                                </tbody>
                                {/* 結算列 */}
                                <tfoot className="bg-gray-50/50 font-medium text-sm">
                                    {/* 小計 */}
                                    <tr>
                                        <td colSpan={4} className="px-4 py-2 text-right text-gray-500">小計 (Subtotal)</td>
                                        <td className="px-4 py-2 text-right text-gray-900">
                                            NT$ {subtotal.toLocaleString()}
                                        </td>
                                    </tr>

                                    {/* 扣除項 */}
                                    {settings.hasRemittanceFee && (
                                        <tr className="text-red-600">
                                            <td colSpan={4} className="px-4 py-1 text-right">扣除：匯費</td>
                                            <td className="px-4 py-1 text-right">- NT$ {fee.toLocaleString()}</td>
                                        </tr>
                                    )}
                                    {settings.hasTax && (
                                        <tr className="text-red-600">
                                            <td colSpan={4} className="px-4 py-1 text-right">扣除：所得稅 (10%)</td>
                                            <td className="px-4 py-1 text-right">- NT$ {tax.toLocaleString()}</td>
                                        </tr>
                                    )}
                                    {settings.hasInsurance && (
                                        <tr className="text-red-600">
                                            <td colSpan={4} className="px-4 py-1 text-right">扣除：二代健保 (2.11%)</td>
                                            <td className="px-4 py-1 text-right">- NT$ {insurance.toLocaleString()}</td>
                                        </tr>
                                    )}

                                    {/* 實付金額 */}
                                    <tr className="bg-blue-50/50 border-t border-blue-100">
                                        <td colSpan={4} className="px-4 py-3 text-right text-blue-800 font-bold">實付金額 (Net Payment)</td>
                                        <td className="px-4 py-3 text-right text-blue-700 font-bold text-lg">
                                            NT$ {netTotal.toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
