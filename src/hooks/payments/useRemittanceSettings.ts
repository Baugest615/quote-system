import { useState, useCallback, useRef } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { RemittanceSettings } from '@/lib/payments/types'
import { Database } from '@/types/database.types'

export const useRemittanceSettings = (confirmationId: string, initialSettings: RemittanceSettings | null) => {
    const [settings, setSettings] = useState<RemittanceSettings>(initialSettings || {})
    const supabase = createClientComponentClient<Database>()
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const saveSettings = useCallback(async (newSettings: RemittanceSettings) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }

        saveTimeoutRef.current = setTimeout(async () => {
            try {
                const { error } = await supabase
                    .from('payment_confirmations')
                    .update({ remittance_settings: newSettings })
                    .eq('id', confirmationId)

                if (error) {
                    console.error('Error saving remittance settings:', JSON.stringify(error, null, 2))
                }
            } catch (err) {
                console.error('Failed to save settings:', err instanceof Error ? err.message : err)
            }
        }, 1000)
    }, [confirmationId, supabase])

    const updateSettings = useCallback((remittanceName: string, updates: Partial<RemittanceSettings[string]>) => {
        setSettings(prev => {
            const currentGroupSettings = prev[remittanceName] || {
                hasRemittanceFee: false,
                remittanceFeeAmount: 30,
                hasTax: false,
                hasInsurance: false
            }

            const newGroupSettings = { ...currentGroupSettings, ...updates }
            const newSettings = { ...prev, [remittanceName]: newGroupSettings }

            saveSettings(newSettings)
            return newSettings
        })
    }, [saveSettings])

    const getSettings = useCallback((remittanceName: string) => {
        return settings[remittanceName] || {
            hasRemittanceFee: false,
            remittanceFeeAmount: 30,
            hasTax: false,
            hasInsurance: false
        }
    }, [settings])

    return {
        settings,
        updateSettings,
        getSettings
    }
}
