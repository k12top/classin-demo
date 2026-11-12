const en = {
  timeline: "Timeline", activities: "Activities", chat: "Class chat",
  preview: "Preview student view", studentView: "Student view", chooseStudent: "Choose a student",
  backToTeacher: "Back to teacher view", loadingStudents: "Loading students…", studentsFailed: "Unable to load students.",
  noStudents: "No students are available for this lesson.",
  previewHint: "Interactions and the lesson summary use the student view. Chat shows messages visible to both you and the student.",
  sharedMessages: "Only messages visible to both you and this student are shown.",
  chatFailed: "Unable to load chat history. Please retry.", earlierMessages: "Load earlier messages",
  loading: "Loading…", noMessages: "No chat messages", retry: "Retry",
  direct: "Direct", staff: "Staff", group: "Group", removed: "Message removed",
  image: "Classroom chat image", imageFailed: "Image could not load",
  quality: "Quality", playbackQuality: "Playback quality", auto: "Auto",
  high: "High (original recording)", sourceQuality: "Source quality",
};

type ReplayReviewCopy = typeof en;
const zhCN: ReplayReviewCopy = {
  timeline: "时间线", activities: "课堂互动", chat: "课堂聊天",
  preview: "预览学生视角", studentView: "学生视角", chooseStudent: "选择学生",
  backToTeacher: "返回教师视角", loadingStudents: "正在加载学生…", studentsFailed: "无法加载学生。",
  noStudents: "此课节没有可预览的学生。",
  previewHint: "互动和课堂总结按学生视角显示；聊天仅显示师生双方可见的消息。",
  sharedMessages: "仅显示你与该学生均可查看的消息。",
  chatFailed: "无法读取聊天记录，请重试。", earlierMessages: "加载更早消息",
  loading: "正在加载…", noMessages: "暂无聊天记录", retry: "重试",
  direct: "私聊", staff: "教学人员", group: "分组", removed: "消息已撤回",
  image: "课堂聊天图片", imageFailed: "图片加载失败",
  quality: "画质", playbackQuality: "回放画质", auto: "自动",
  high: "高画质（原始录像）", sourceQuality: "源画质",
};
const zhTW: ReplayReviewCopy = {
  timeline: "時間軸", activities: "課堂互動", chat: "課堂聊天",
  preview: "預覽學生視角", studentView: "學生視角", chooseStudent: "選擇學生",
  backToTeacher: "返回教師視角", loadingStudents: "正在載入學生…", studentsFailed: "無法載入學生。",
  noStudents: "此課節沒有可預覽的學生。",
  previewHint: "互動和課堂總結按學生視角顯示；聊天僅顯示師生雙方可見的訊息。",
  sharedMessages: "僅顯示你與該學生均可查看的訊息。",
  chatFailed: "無法讀取聊天記錄，請重試。", earlierMessages: "載入更早訊息",
  loading: "正在載入…", noMessages: "暫無聊天記錄", retry: "重試",
  direct: "私訊", staff: "教學人員", group: "分組", removed: "訊息已撤回",
  image: "課堂聊天圖片", imageFailed: "圖片載入失敗",
  quality: "畫質", playbackQuality: "回放畫質", auto: "自動",
  high: "高畫質（原始錄影）", sourceQuality: "來源畫質",
};
const vi: ReplayReviewCopy = {
  timeline: "Dòng thời gian", activities: "Tương tác", chat: "Trò chuyện trong lớp",
  preview: "Xem giao diện học sinh", studentView: "Giao diện học sinh", chooseStudent: "Chọn học sinh",
  backToTeacher: "Về giao diện giáo viên", loadingStudents: "Đang tải học sinh…", studentsFailed: "Không thể tải học sinh.",
  noStudents: "Buổi học này không có học sinh để xem trước.",
  previewHint: "Tương tác và tổng kết hiển thị theo học sinh. Trò chuyện chỉ gồm tin nhắn mà cả bạn và học sinh đều được xem.",
  sharedMessages: "Chỉ hiển thị tin nhắn mà cả bạn và học sinh này đều được xem.",
  chatFailed: "Không thể tải lịch sử trò chuyện. Vui lòng thử lại.", earlierMessages: "Tải tin nhắn trước",
  loading: "Đang tải…", noMessages: "Chưa có tin nhắn", retry: "Thử lại",
  direct: "Tin nhắn riêng", staff: "Giáo viên và trợ giảng", group: "Nhóm", removed: "Tin nhắn đã thu hồi",
  image: "Ảnh trong trò chuyện lớp học", imageFailed: "Không thể tải ảnh",
  quality: "Chất lượng", playbackQuality: "Chất lượng phát lại", auto: "Tự động",
  high: "Cao (bản ghi gốc)", sourceQuality: "Chất lượng gốc",
};

export function replayReviewCopy(locale: string): ReplayReviewCopy {
  if (locale === "zh-TW") return zhTW;
  if (locale.startsWith("zh")) return zhCN;
  if (locale.startsWith("vi")) return vi;
  return en;
}
