const copy={
 'zh-CN':{title:'老师请求控制你的屏幕',desktopOnly:'请使用支持远控的桌面客户端并共享整个屏幕。',decline:'拒绝',requestFailed:'无法显示请求。请确认共享的是整个屏幕，或在课堂中拒绝。',declineFailed:'拒绝请求未确认，请重试。',failed:'无法启动远程控制，请检查共享状态和客户端权限后重试。'},
 'zh-TW':{title:'老師請求控制你的螢幕',desktopOnly:'請使用支援遠端控制的桌面客戶端並分享整個螢幕。',decline:'拒絕',requestFailed:'無法顯示請求。請確認分享整個螢幕，或在課堂中拒絕。',declineFailed:'拒絕請求未確認，請重試。',failed:'無法啟動遠端控制，請檢查分享狀態和客戶端權限後重試。'},
 en:{title:'Your teacher requests screen control',desktopOnly:'Use a desktop app that supports remote control and share your entire screen.',decline:'Decline',requestFailed:'Could not show the request. Share your entire screen or decline it here.',declineFailed:'The request could not be declined. Try again.',failed:'Could not start control. Check screen sharing and app permissions, then try again.'},
 vi:{title:'Giáo viên yêu cầu điều khiển màn hình',desktopOnly:'Dùng ứng dụng máy tính hỗ trợ điều khiển từ xa và chia sẻ toàn màn hình.',decline:'Từ chối',requestFailed:'Không thể hiện yêu cầu. Hãy chia sẻ toàn màn hình hoặc từ chối tại đây.',declineFailed:'Không thể từ chối yêu cầu. Hãy thử lại.',failed:'Không thể bắt đầu điều khiển. Hãy kiểm tra chia sẻ màn hình và quyền ứng dụng rồi thử lại.'},
} as const;
export function remoteControlCopy(locale:string){return copy[locale as keyof typeof copy]||copy.en;}
