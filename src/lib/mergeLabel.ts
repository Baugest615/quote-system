/** 將數字索引轉換為 Excel 風格的欄位標籤 (0→A, 25→Z, 26→AA, 27→AB...) */
export function getMergeLabel(index: number): string {
  let label = ''
  let n = index
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}
