'use client'

import { Fragment, createContext, useContext, useState, useCallback, useRef } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './button'

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext)
  if (!fn) throw new Error('useConfirm must be used within ConfirmDialogProvider')
  return fn
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions>({
    title: '',
    description: '',
    confirmLabel: '確認',
    cancelLabel: '取消',
    variant: 'default',
  })
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions({
      title: opts.title,
      description: opts.description,
      confirmLabel: opts.confirmLabel ?? '確認',
      cancelLabel: opts.cancelLabel ?? '取消',
      variant: opts.variant ?? 'default',
    })
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const handleClose = useCallback((result: boolean) => {
    setOpen(false)
    resolveRef.current?.(result)
    resolveRef.current = null
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <Transition.Root show={open} as={Fragment}>
        <Dialog as="div" className="relative z-[60]" onClose={() => handleClose(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-[60] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="relative w-full max-w-md transform rounded-lg bg-card border border-border p-6 text-left shadow-xl transition-all">
                  <div className="flex items-start gap-4">
                    {options.variant === 'destructive' && (
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      </div>
                    )}
                    <div className="flex-1">
                      <Dialog.Title as="h3" className="text-base font-semibold text-foreground">
                        {options.title}
                      </Dialog.Title>
                      {options.description && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {options.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleClose(false)}
                    >
                      {options.cancelLabel}
                    </Button>
                    <Button
                      variant={options.variant === 'destructive' ? 'destructive' : 'default'}
                      size="sm"
                      onClick={() => handleClose(true)}
                    >
                      {options.confirmLabel}
                    </Button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </ConfirmContext.Provider>
  )
}
