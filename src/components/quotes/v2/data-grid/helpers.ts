import type { QuotationWithClient } from '@/app/dashboard/quotes/page'

export type QuoteSortKey = 'quote_number' | 'created_at' | 'project_name' | 'client_name' | 'budget_total' | 'status' | 'kol_names' | 'services'

export function getQuoteTotal(q: QuotationWithClient): number {
    return q.has_discount && q.discounted_price
        ? q.discounted_price + Math.round(q.discounted_price * 0.05)
        : (q.grand_total_taxed || 0)
}

export function getKolNames(q: QuotationWithClient): string {
    if (!q.quotation_items?.length) return ''
    const names = Array.from(new Set(q.quotation_items.map(i => i.kols?.name).filter((n): n is string => !!n)))
    return names.join(', ')
}

export function getServices(q: QuotationWithClient): string {
    if (!q.quotation_items?.length) return ''
    const services = Array.from(new Set(q.quotation_items.map(i => i.service).filter((s): s is string => !!s)))
    return services.join(', ')
}

export function getSortValue(q: QuotationWithClient, key: QuoteSortKey): string | number | null {
    switch (key) {
        case 'quote_number': return q.quote_number ?? null
        case 'created_at': return q.created_at ?? null
        case 'project_name': return q.project_name ?? null
        case 'client_name': return q.clients?.name ?? null
        case 'budget_total': return getQuoteTotal(q)
        case 'status': return q.status ?? null
        case 'kol_names': return getKolNames(q) || null
        case 'services': return getServices(q) || null
    }
}
