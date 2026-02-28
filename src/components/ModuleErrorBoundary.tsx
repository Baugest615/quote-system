'use client'

import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { isDev } from '@/lib/env'

interface ModuleErrorBoundaryProps {
  module: string
  children: ReactNode
}

interface ModuleErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ModuleErrorBoundary extends Component<ModuleErrorBoundaryProps, ModuleErrorBoundaryState> {
  constructor(props: ModuleErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ModuleErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ModuleErrorBoundary] 「${this.props.module}」模組錯誤:`, error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-8 w-8 text-amber-400" />
            <h2 className="text-xl font-semibold text-foreground">
              「{this.props.module}」模組發生錯誤
            </h2>
          </div>
          <p className="text-muted-foreground mb-6 text-center max-w-md">
            此區域發生了非預期的錯誤，請嘗試重新載入。若問題持續，請聯繫系統管理員。
          </p>
          {isDev && this.state.error && (
            <pre className="bg-muted p-4 rounded-lg text-sm text-destructive mb-6 max-w-lg overflow-auto">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            重新載入
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
