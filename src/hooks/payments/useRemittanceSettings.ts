import { useState, useCallback, useRef, useEffect } from 'react'
import supabase from '@/lib/supabase/client'
import { RemittanceSettings } from '@/lib/payments/types'

export const useRemittanceSettings = (
    confirmationId: string,
    initialSettings: RemittanceSettings | null,
    onSettingsChange?: (newSettings: RemittanceSettings) => void
) => {
    const [settings, setSettings] = useState<RemittanceSettings>(initialSettings || {})
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const onSettingsChangeRef = useRef(onSettingsChange)
    onSettingsChangeRef.current = onSettingsChange

    // Sync state with props when data is loaded/refreshed
    useEffect(() => {
        if (initialSettings) {
            setSettings(initialSettings)
        }
    }, [initialSettings])

    const saveSettings = useCallback(async (newSettings: RemittanceSettings) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }

        saveTimeoutRef.current = setTimeout(async () => {
            try {
                const { error } = await supabase
                    .rpc('update_remittance_settings', {
                        p_confirmation_id: confirmationId,
                        p_settings: newSettings
                    })

                if (error) {
                    console.error('Error saving remittance settings:', error.message)
                }
            } catch (err) {
                console.error('Failed to save settings:', err instanceof Error ? err.message : err)
            }
        }, 1000)
    }, [confirmationId])

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
            // Defer parent notification to avoid setState-during-render warning
            queueMicrotask(() => onSettingsChangeRef.current?.(newSettings))
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
