// src/components/quotes/form/QuoteFormItemsTable.tsx
// 報價單表單 — 報價項目表格（類別、KOL、執行內容、單價、成本、數量、合計）

'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocompleteWithCreate } from '@/components/ui/AutocompleteWithCreate'
import { PlusCircle, Trash2, Calculator } from 'lucide-react'
import type { QuoteFormItemsTableProps } from './types'

export function QuoteFormItemsTable({ form, fieldArray, formData }: QuoteFormItemsTableProps) {
  const { register, watch, setValue, formState: { errors } } = form
  const { fields, append, remove } = fieldArray
  const watchItems = watch('items')
  const {
    kolOptions,
    categoryOptions,
    quoteCategories,
    searchKols,
    handleKolChange,
    getKolServices,
  } = formData

  return (
    <div className="bg-card p-6 rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center">
          <Calculator className="mr-2 h-5 w-5 text-primary" />報價項目
        </h2>
        <Button type="button" onClick={() => append({
          category: null, kol_id: null, kol_name: null, is_new_kol: false,
          service: '', is_new_service: false, quantity: 1, price: 0, cost: 0, remark: null,
        })}>
          <PlusCircle className="mr-2 h-4 w-4" /> 新增項目
        </Button>
      </div>
      {errors.items && <p className="text-destructive text-sm mb-2">{errors.items.message}</p>}
      <div className="overflow-x-auto">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="bg-secondary">
              <th className="p-2 w-[160px] text-left font-medium text-muted-foreground">類別</th>
              <th className="p-2 w-[200px] text-left font-medium text-muted-foreground">KOL/服務</th>
              <th className="p-2 w-[220px] text-left font-medium text-muted-foreground">執行內容</th>
              <th className="p-2 w-[100px] text-left font-medium text-muted-foreground">單價</th>
              <th className="p-2 w-[100px] text-left font-medium text-muted-foreground">成本</th>
              <th className="p-2 w-[70px] text-left font-medium text-muted-foreground">數量</th>
              <th className="p-2 w-[110px] text-left font-medium text-muted-foreground">合計</th>
              <th className="p-2 w-[50px] text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => {
              const itemPrice = watchItems[index]?.price || 0
              const itemQuantity = watchItems[index]?.quantity || 1
              const itemTotal = itemPrice * itemQuantity
              const currentKolId = watchItems[index]?.kol_id
              const currentKolServices = getKolServices(currentKolId)

              // 目前 KOL 的服務選項
              const serviceOptions = currentKolServices.map(s => ({
                label: s.service_types.name,
                value: s.service_types.name,
                description: `報價 ${s.price.toLocaleString()} / 成本 ${s.cost.toLocaleString()}`,
                data: { price: s.price, cost: s.cost },
              }))

              return (
                <tr key={field.id} className="align-top border-b table-row-min-height">
                  {/* 類別 */}
                  <td className="p-3 align-top">
                    <AutocompleteWithCreate
                      selectedId={null}
                      inputText={watchItems[index]?.category || ''}
                      options={categoryOptions}
                      placeholder="類別"
                      createLabel="新增類別"
                      allowCreate={true}
                      onSelect={(_id) => {
                        const cat = quoteCategories.find(c => c.id === _id)
                        setValue(`items.${index}.category`, cat?.name || '')
                      }}
                      onCreateIntent={(text) => {
                        setValue(`items.${index}.category`, text)
                      }}
                      onClear={() => {
                        setValue(`items.${index}.category`, null)
                      }}
                    />
                  </td>

                  {/* KOL/服務 */}
                  <td className="p-3 align-top">
                    <AutocompleteWithCreate
                      selectedId={currentKolId ?? null}
                      inputText={watchItems[index]?.kol_name || ''}
                      options={kolOptions}
                      placeholder="搜尋 KOL/服務"
                      createLabel="新增 KOL/服務"
                      onSearch={searchKols}
                      onSelect={(kolId) => {
                        handleKolChange(index, kolId)
                      }}
                      onCreateIntent={(name) => {
                        setValue(`items.${index}.kol_id`, null)
                        setValue(`items.${index}.kol_name`, name)
                        setValue(`items.${index}.is_new_kol`, true)
                        setValue(`items.${index}.service`, '')
                        setValue(`items.${index}.is_new_service`, false)
                        setValue(`items.${index}.price`, 0)
                        setValue(`items.${index}.cost`, 0)
                      }}
                      onClear={() => {
                        setValue(`items.${index}.kol_id`, null)
                        setValue(`items.${index}.kol_name`, null)
                        setValue(`items.${index}.is_new_kol`, false)
                        setValue(`items.${index}.service`, '')
                        setValue(`items.${index}.is_new_service`, false)
                        setValue(`items.${index}.price`, 0)
                        setValue(`items.${index}.cost`, 0)
                      }}
                    />
                  </td>

                  {/* 服務 */}
                  <td className="p-3 align-top">
                    <AutocompleteWithCreate<{ price: number; cost: number }>
                      selectedId={null}
                      inputText={watchItems[index]?.service || ''}
                      options={serviceOptions}
                      placeholder={currentKolId ? '搜尋或輸入執行內容' : (watchItems[index]?.is_new_kol ? '輸入執行內容' : '請先選 KOL/服務')}
                      createLabel="新增服務"
                      disabled={!currentKolId && !watchItems[index]?.is_new_kol}
                      onSelect={(serviceName, data) => {
                        setValue(`items.${index}.service`, serviceName)
                        setValue(`items.${index}.is_new_service`, false)
                        if (data) {
                          setValue(`items.${index}.price`, data.price)
                          setValue(`items.${index}.cost`, data.cost)
                        }
                      }}
                      onCreateIntent={(serviceName) => {
                        setValue(`items.${index}.service`, serviceName)
                        setValue(`items.${index}.is_new_service`, true)
                      }}
                      onClear={() => {
                        setValue(`items.${index}.service`, '')
                        setValue(`items.${index}.is_new_service`, false)
                      }}
                    />
                    {errors.items?.[index]?.service && (
                      <p className="text-destructive text-xs mt-1">{errors.items[index]?.service?.message}</p>
                    )}
                  </td>

                  {/* 單價 */}
                  <td className="p-3 align-top">
                    <Input type="number" {...register(`items.${index}.price`, { valueAsNumber: true })} placeholder="價格" />
                    {errors.items?.[index]?.price && <p className="text-destructive text-xs mt-1">{errors.items[index]?.price?.message}</p>}
                  </td>

                  {/* 成本 */}
                  <td className="p-3 align-top">
                    <Input type="number" {...register(`items.${index}.cost`, { valueAsNumber: true })} placeholder="成本" />
                  </td>

                  {/* 數量 */}
                  <td className="p-3 align-top">
                    <Input type="number" {...register(`items.${index}.quantity`, { valueAsNumber: true })} defaultValue={1} />
                    {errors.items?.[index]?.quantity && <p className="text-destructive text-xs mt-1">{errors.items[index]?.quantity?.message}</p>}
                  </td>

                  {/* 合計 */}
                  <td className="p-3 align-top">
                    <div className="text-sm font-semibold text-foreground/70 py-2">NT$ {itemTotal.toLocaleString()}</div>
                  </td>

                  {/* 操作 */}
                  <td className="p-3 text-center align-top">
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} disabled={fields.length === 1}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
