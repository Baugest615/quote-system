// 請款系統常數定義
// 包含顏色、配置、驗證規則等

// ==================== 顏色系統 ====================

export const PAYMENT_COLORS = {
    // 狀態顏色
    status: {
        pending: 'bg-yellow-50 border-yellow-200 text-yellow-800',
        approved: 'bg-green-50 border-green-200 text-green-800',
        rejected: 'bg-red-50 border-red-200 text-red-800',
        confirmed: 'bg-blue-50 border-blue-200 text-blue-800',
        ready: 'bg-green-50 border-green-200 text-green-800',
        incomplete: 'bg-orange-50 border-orange-200 text-orange-800',
    },

    // 狀態徽章顏色
    badge: {
        pending: 'bg-yellow-100 text-yellow-800',
        approved: 'bg-green-100 text-green-800',
        rejected: 'bg-red-100 text-red-800',
        confirmed: 'bg-blue-100 text-blue-800',
        ready: 'bg-green-100 text-green-800',
        incomplete: 'bg-orange-100 text-orange-800',
    },

    // 合併群組顏色（保留原有）
    merge: [
        'bg-red-100',
        'bg-blue-100',
        'bg-green-100',
        'bg-yellow-100',
        'bg-purple-100',
        'bg-pink-100'
    ],

    // 優先級顏色
    priority: {
        high: 'bg-red-100 text-red-800 border-red-200',
        medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        low: 'bg-gray-100 text-gray-800 border-gray-200',
    }
} as const

// ==================== 狀態標籤 ====================

export const STATUS_LABELS = {
    pending: '待審核',
    approved: '已核准',
    rejected: '已駁回',
    confirmed: '已確認',
    ready: '已備妥',
    incomplete: '待補件',
    all: '全部'
} as const

// ==================== 驗證規則 ====================

export const VALIDATION_RULES = {
    // 發票號碼格式：兩個英文字母 + 連字號 + 8位數字
    invoiceNumber: {
        pattern: /^[A-Za-z]{2}-\d{8}$/,
        message: '發票號碼格式：AB-12345678'
    },

    // 成本金額
    costAmount: {
        min: 0,
        max: 10000000,
        message: '成本金額必須在 0 到 10,000,000 之間'
    },

    // 附件
    attachment: {
        maxSize: 10 * 1024 * 1024, // 10MB
        maxCount: 10,
        allowedTypes: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ],
        message: '檔案大小不得超過 10MB，最多 10 個檔案'
    }
} as const

// ==================== 交互配置 ====================

export const INTERACTION_CONFIG = {
    // 動畫時長（毫秒）
    animation: {
        fast: 150,
        normal: 300,
        slow: 500
    },

    // Toast 顯示時長（毫秒）
    toast: {
        success: 3000,
        error: 5000,
        info: 4000,
        warning: 4000
    },

    // 自動刷新間隔（毫秒）
    autoRefresh: {
        pending: 30000,      // 30秒
        requests: 60000,     // 1分鐘
        confirmed: 300000,   // 5分鐘
        disabled: 0          // 關閉
    },

    // 防抖延遲（毫秒）
    debounce: {
        search: 300,
        input: 500,
        resize: 200
    }
} as const

// ==================== 分頁配置 ====================

export const PAGINATION_CONFIG = {
    defaultPageSize: 20,
    pageSizeOptions: [10, 20, 50, 100],
    maxPageButtons: 5
} as const

// ==================== 日期格式 ====================

export const DATE_FORMATS = {
    display: 'YYYY-MM-DD HH:mm',
    displayShort: 'YYYY-MM-DD',
    export: 'YYYY-MM-DD_HHmmss',
    api: 'YYYY-MM-DDTHH:mm:ss.SSSZ'
} as const

// ==================== 匯出配置 ====================

export const EXPORT_CONFIG = {
    csv: {
        delimiter: ',',
        encoding: 'utf-8-bom', // 支援中文
        extension: '.csv'
    },
    excel: {
        extension: '.xlsx',
        sheetName: '請款資料'
    },
    pdf: {
        extension: '.pdf',
        pageSize: 'A4',
        orientation: 'landscape'
    }
} as const

// ==================== 錯誤訊息 ====================

export const ERROR_MESSAGES = {
    // 網路錯誤
    network: {
        timeout: '請求超時，請檢查網路連線',
        offline: '網路連線中斷，請檢查網路設定',
        serverError: '伺服器錯誤，請稍後再試'
    },

    // 驗證錯誤
    validation: {
        required: '此欄位為必填',
        invalidFormat: '格式不正確',
        minLength: '長度不足',
        maxLength: '長度超過限制',
        invalidNumber: '請輸入有效的數字',
        invalidDate: '請輸入有效的日期'
    },

    // 操作錯誤
    operation: {
        noSelection: '請選擇至少一個項目',
        insufficientData: '資料不完整',
        duplicateEntry: '資料重複',
        notFound: '找不到指定的資料',
        unauthorized: '沒有權限執行此操作',
        conflict: '操作衝突，請重新整理後再試'
    },

    // 檔案錯誤
    file: {
        tooLarge: '檔案大小超過限制',
        invalidType: '不支援的檔案類型',
        uploadFailed: '檔案上傳失敗',
        downloadFailed: '檔案下載失敗'
    }
} as const

// ==================== 成功訊息 ====================

export const SUCCESS_MESSAGES = {
    create: '新增成功',
    update: '更新成功',
    delete: '刪除成功',
    submit: '提交成功',
    approve: '核准成功',
    reject: '駁回成功',
    confirm: '確認成功',
    export: '匯出成功',
    upload: '上傳成功',
    download: '下載成功',
    merge: '合併成功',
    unmerge: '解除合併成功',
    clear: '清除成功'
} as const

// ==================== 確認訊息 ====================

export const CONFIRM_MESSAGES = {
    delete: '確定要刪除嗎？此操作無法復原。',
    submit: '確定要提交嗎？',
    approve: '確定要核准嗎？',
    reject: '確定要駁回嗎？請填寫駁回原因。',
    revert: '確定要撤銷嗎？',
    merge: '確定要合併這些項目嗎？',
    unmerge: (count: number) => `確定要解除合併嗎？這將影響 ${count} 個項目。`,
    clear: '確定要清除嗎？'
} as const

// ==================== 預設值 ====================

export const DEFAULT_VALUES = {
    searchTerm: '',
    pageSize: 20,
    currentPage: 1,
    sortField: 'date' as const,
    sortOrder: 'desc' as const,
    viewMode: 'grouped' as const,
    autoRefresh: false
} as const

// ==================== API 端點 ====================

export const API_ENDPOINTS = {
    pending: {
        list: 'get_available_pending_payments',
        rejected: 'payment_requests',
        submit: 'payment_requests'
    },
    requests: {
        list: 'payment_requests_with_details',
        verify: 'payment_requests',
        confirm: 'payment_confirmations'
    },
    confirmed: {
        list: 'payment_confirmations',
        items: 'payment_confirmation_items',
        revert: 'payment_confirmations'
    }
} as const
