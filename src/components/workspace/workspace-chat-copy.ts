const translations:Record<string,readonly [string,string]>={
 "Unable to access chat. Check your access and retry.":["無法存取聊天，請確認權限後重試。","Không thể truy cập trò chuyện. Hãy kiểm tra quyền và thử lại."],
 "Sync failed. Please retry.":["同步失敗，請重試。","Đồng bộ không thành công. Vui lòng thử lại."],
 "View lesson":["查看課節","Xem buổi học"],
 "Conversations":["會話列表","Danh sách trò chuyện"],"No conversations found":["沒有找到會話","Không tìm thấy cuộc trò chuyện"],
 "Chat":["聊天","Trò chuyện"],"Search conversations":["搜尋會話","Tìm cuộc trò chuyện"],"Conversation filter":["篩選會話","Lọc cuộc trò chuyện"],"All":["全部","Tất cả"],"Direct":["私聊","Trực tiếp"],"Direct messages":["私聊","Tin nhắn riêng"],"New direct message":["發起私聊","Tin nhắn riêng mới"],
 "Loading direct messages…":["正在載入私聊…","Đang tải tin nhắn riêng…"],"Unable to load direct messages.":["私聊列表載入失敗。","Không thể tải tin nhắn riêng."],"Retry":["重試","Thử lại"],"No matching direct messages":["沒有符合的私聊","Không tìm thấy tin nhắn riêng phù hợp"],"No direct messages yet":["暫無私聊","Chưa có tin nhắn riêng"],
 "Class conversations":["班級會話","Trò chuyện lớp học"],"Class conversation":["班級群聊","Trò chuyện lớp học"],"No classes found":["找不到班級","Không tìm thấy lớp học"],"Direct message":["私聊","Tin nhắn riêng"],"View class":["查看班級","Xem lớp"],"Unable to load":["讀取失敗","Không thể tải"],"Load earlier messages":["載入較早訊息","Tải tin nhắn trước"],
 "Me":["我","Tôi"],"Sending":["傳送中","Đang gửi"],"Retry scheduled":["等待自動重試","Đang chờ thử lại"],"Failed":["傳送失敗","Gửi không thành công"],"Start a conversation":["開始私聊","Bắt đầu trò chuyện"],"Start a class conversation":["開始班級聊天","Bắt đầu trò chuyện trong lớp"],"Message":["文字訊息","Tin nhắn"],
 "Type a message. Enter to send; Shift + Enter for a new line.":["輸入訊息，Enter 傳送，Shift + Enter 換行","Nhập tin nhắn. Enter để gửi; Shift + Enter để xuống dòng."],"Local storage is unavailable. Unsent messages may be lost when you leave.":["無法儲存本機草稿，離開頁面後待傳送訊息可能遺失。","Không thể lưu bản nháp trên thiết bị. Tin nhắn chưa gửi có thể bị mất khi bạn rời trang."],"Send":["傳送","Gửi"],
 "Conversation unavailable. Choose another conversation.":["會話暫時無法使用，請選擇其他會話。","Cuộc trò chuyện không khả dụng. Hãy chọn cuộc trò chuyện khác."],"Join a class to chat":["加入班級後即可聊天","Tham gia lớp học để trò chuyện"],"Choose someone from a shared class":["選擇共同班級中的成員","Chọn thành viên trong lớp học chung"],
 "Unable to load class members.":["無法讀取班級成員，請重試。","Không thể tải thành viên lớp học."],"Unable to start conversation. Please retry.":["無法發起私聊，請重試。","Không thể bắt đầu trò chuyện. Vui lòng thử lại."],"Shared class":["共同班級","Lớp học chung"],"No classes":["暫無班級","Chưa có lớp học"],"Member":["成員","Thành viên"],"Loading…":["載入中…","Đang tải…"],"Choose a member":["選擇成員","Chọn thành viên"],"There are no other class members.":["此班級暫無其他成員。","Lớp học chưa có thành viên khác."],"Start chat":["開始聊天","Bắt đầu trò chuyện"],
};

export function workspaceChatText(locale:string,zh:string,en:string){
 const value=translations[en];
 return locale==="zh-TW"?(value?.[0]||zh):locale.startsWith("zh")?zh:locale.startsWith("vi")?(value?.[1]||en):en;
}
