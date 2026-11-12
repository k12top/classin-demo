const messages = {
  en: {
    pending: "A class creation is awaiting confirmation. Retry now or reopen this form.",
    busy: "Another window is creating a class. Try again shortly.",
    uncertain: "The result is uncertain. Retry here; check the class list before trying again.",
    failed: "Could not create the class. Check the form and retry.",
    discardWarning: "The class may already exist. Discarding recovery will not delete it; check the class list first.",
    keepRecovery: "Keep recovery", discardAndClose: "Discard recovery and close", discard: "Discard recovery", retry: "Retry to confirm",
  },
  "zh-CN": {
    pending: "发现待确认的班级创建，请重试确认；重新打开也可继续。",
    busy: "另一个窗口正在创建班级，请稍后重试。",
    uncertain: "创建结果暂不确定，请在当前窗口重试；关闭后先检查班级列表。",
    failed: "创建失败，请检查内容后重试。",
    discardWarning: "班级可能已经创建。放弃恢复不会删除它，请先检查班级列表。",
    keepRecovery: "继续恢复", discardAndClose: "放弃恢复并关闭", discard: "放弃恢复", retry: "重试确认",
  },
  "zh-TW": {
    pending: "發現待確認的班級建立，請重試確認；重新開啟後也可繼續。",
    busy: "另一個視窗正在建立班級，請稍後重試。",
    uncertain: "暫時無法確認建立結果，請在此視窗重試；關閉後請先檢查班級列表。",
    failed: "建立失敗，請檢查內容後重試。",
    discardWarning: "班級可能已經建立。放棄復原不會刪除班級，請先檢查班級列表。",
    keepRecovery: "繼續復原", discardAndClose: "放棄復原並關閉", discard: "放棄復原", retry: "重試確認",
  },
  vi: {
    pending: "Việc tạo lớp đang chờ xác nhận. Hãy thử lại hoặc mở lại biểu mẫu này.",
    busy: "Một cửa sổ khác đang tạo lớp. Vui lòng thử lại sau.",
    uncertain: "Chưa thể xác nhận kết quả. Hãy thử lại tại đây; kiểm tra danh sách lớp trước khi thử lại sau khi đóng cửa sổ.",
    failed: "Không thể tạo lớp. Hãy kiểm tra thông tin và thử lại.",
    discardWarning: "Lớp có thể đã được tạo. Bỏ khôi phục không xóa lớp; hãy kiểm tra danh sách lớp trước.",
    keepRecovery: "Tiếp tục khôi phục", discardAndClose: "Bỏ khôi phục và đóng", discard: "Bỏ khôi phục", retry: "Thử lại để xác nhận",
  },
} as const;

export function workspaceClassCreationCopy(locale: string) {
  if (locale === "zh-TW") return messages["zh-TW"];
  if (locale.startsWith("zh")) return messages["zh-CN"];
  if (locale.startsWith("vi")) return messages.vi;
  return messages.en;
}
