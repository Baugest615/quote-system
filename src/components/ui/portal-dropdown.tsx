'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface PortalDropdownProps {
    isOpen: boolean
    children: React.ReactNode
    triggerRef: React.RefObject<HTMLElement>
    className?: string
}

export const PortalDropdown = ({
    isOpen,
    children,
    triggerRef,
    className = ''
}: PortalDropdownProps) => {
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })

    useEffect(() => {
        if (isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect()
            setPosition({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width
            })
        }
    }, [isOpen, triggerRef])

    if (!isOpen || typeof window === 'undefined') return null

    return createPortal(
        <div
            className={`fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto ${className}`}
            style={{
                top: `${position.top + 4}px`,
                left: `${position.left}px`,
                minWidth: `${position.width}px`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {children}
        </div>,
        document.body
    )
}
