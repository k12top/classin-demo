const copy={
 "zh-CN":{translated:"译文",hideOriginal:"隐藏原文",showOriginal:"显示原文",auto:"自动翻译",language:"翻译语言",follow:"跟随界面语言",unavailable:"翻译暂不可用，原文仍可查看。",failed:"翻译失败。",retry:"重试"},
 "zh-TW":{translated:"譯文",hideOriginal:"隱藏原文",showOriginal:"顯示原文",auto:"自動翻譯",language:"翻譯語言",follow:"跟隨介面語言",unavailable:"翻譯暫時無法使用，仍可查看原文。",failed:"翻譯失敗。",retry:"重試"},
 vi:{translated:"Bản dịch",hideOriginal:"Ẩn bản gốc",showOriginal:"Xem bản gốc",auto:"Tự động dịch",language:"Ngôn ngữ dịch",follow:"Theo ngôn ngữ giao diện",unavailable:"Chưa thể dịch. Bạn vẫn có thể xem bản gốc.",failed:"Dịch không thành công.",retry:"Thử lại"},
 en:{translated:"Translated",hideOriginal:"Hide original",showOriginal:"Show original",auto:"Auto-translate",language:"Translation language",follow:"Follow interface language",unavailable:"Translation is unavailable. Original messages remain visible.",failed:"Translation failed.",retry:"Retry"},
} as const;

export function workspaceChatTranslationCopy(locale:string){
 return locale==="zh-TW"?copy["zh-TW"]:locale.startsWith("zh")?copy["zh-CN"]:locale.startsWith("vi")?copy.vi:copy.en;
}
