const zh = {
 title: "设备检测", intro: "上课前检查摄像头、麦克风和扬声器。检测仅在本机进行。",
 cameraPreview: "摄像头预览", cameraOff: "摄像头未开启", checkCamera: "检测摄像头", checkMicrophone: "检测麦克风",
 testSpeaker: "播放测试音", stopCheck: "停止检测", microphoneInput: "麦克风输入", preparing: "正在准备设备…",
 deviceDisconnected: "设备已断开，请检查连接后重新检测。",
 captureTimeout: "设备响应超时，请检查浏览器权限提示和设备连接后重试。",
 unavailable: "无法启动检测，请检查设备连接及系统或浏览器权限。",
 permissionDenied: "设备访问未获允许。请在系统或浏览器设置中允许访问，再重新检测。",
 notFound: "没有找到所需设备，请连接摄像头或麦克风后重新检测。",
 inUse: "无法读取设备，设备可能正被其他应用占用。请关闭占用的应用后重试。",
 speakerFailed: "无法播放测试音，请检查扬声器。",
};
type DeviceCopy = Record<keyof typeof zh, string>;
const tw: DeviceCopy = {
 title: "裝置檢測", intro: "上課前檢查攝影機、麥克風和揚聲器。檢測僅在本機進行。",
 cameraPreview: "攝影機預覽", cameraOff: "攝影機未開啟", checkCamera: "檢測攝影機", checkMicrophone: "檢測麥克風",
 testSpeaker: "播放測試音", stopCheck: "停止檢測", microphoneInput: "麥克風輸入", preparing: "正在準備裝置…",
 deviceDisconnected: "裝置已中斷連線，請檢查連線後重新檢測。",
 captureTimeout: "裝置回應逾時，請檢查瀏覽器權限提示和裝置連線後重試。",
 unavailable: "無法啟動檢測，請檢查裝置連線及系統或瀏覽器權限。",
 permissionDenied: "尚未允許存取裝置。請在系統或瀏覽器設定中允許存取，再重新檢測。",
 notFound: "找不到所需裝置，請連接攝影機或麥克風後重新檢測。",
 inUse: "無法讀取裝置，可能正被其他應用程式使用。請關閉使用中的應用程式後重試。",
 speakerFailed: "無法播放測試音，請檢查揚聲器。",
};
const en: DeviceCopy = {
 title: "Device check", intro: "Check your camera, microphone and speakers before class. Checks run locally.",
 cameraPreview: "Camera preview", cameraOff: "Camera is off", checkCamera: "Check camera", checkMicrophone: "Check microphone",
 testSpeaker: "Test speaker", stopCheck: "Stop check", microphoneInput: "Microphone input", preparing: "Preparing the device…",
 deviceDisconnected: "The device disconnected. Check its connection and try again.",
 captureTimeout: "The device did not respond. Check the browser's permission prompt and device connection, then try again.",
 unavailable: "Could not start the check. Check the device connection and system or browser permissions.",
 permissionDenied: "Device access was not allowed. Allow access in system or browser settings, then try again.",
 notFound: "No matching device was found. Connect a camera or microphone and try again.",
 inUse: "The device could not be read. Another app may be using it. Close that app and try again.",
 speakerFailed: "Unable to play the test tone. Check your speakers.",
};
const vi: DeviceCopy = {
 title: "Kiểm tra thiết bị", intro: "Kiểm tra camera, micrô và loa trước giờ học. Việc kiểm tra chỉ diễn ra trên thiết bị của bạn.",
 cameraPreview: "Xem trước camera", cameraOff: "Camera đang tắt", checkCamera: "Kiểm tra camera", checkMicrophone: "Kiểm tra micrô",
 testSpeaker: "Thử loa", stopCheck: "Dừng kiểm tra", microphoneInput: "Tín hiệu micrô", preparing: "Đang chuẩn bị thiết bị…",
 deviceDisconnected: "Thiết bị đã ngắt kết nối. Kiểm tra kết nối rồi thử lại.",
 captureTimeout: "Thiết bị không phản hồi. Kiểm tra yêu cầu cấp quyền của trình duyệt và kết nối thiết bị rồi thử lại.",
 unavailable: "Không thể bắt đầu kiểm tra. Kiểm tra kết nối thiết bị và quyền trong hệ thống hoặc trình duyệt.",
 permissionDenied: "Chưa được phép truy cập thiết bị. Hãy cấp quyền trong cài đặt hệ thống hoặc trình duyệt rồi thử lại.",
 notFound: "Không tìm thấy thiết bị phù hợp. Kết nối camera hoặc micrô rồi thử lại.",
 inUse: "Không thể đọc thiết bị. Có thể một ứng dụng khác đang sử dụng thiết bị. Đóng ứng dụng đó rồi thử lại.",
 speakerFailed: "Không thể phát âm thanh thử. Hãy kiểm tra loa.",
};
export type DeviceCheckError = "deviceDisconnected" | "captureTimeout" | "unavailable" | "permissionDenied" | "notFound" | "inUse" | "speakerFailed";
export function workspaceDeviceCopy(locale: string): DeviceCopy {
 const language=locale.toLowerCase();
 return /^zh-(tw|hk|hant)(-|$)/.test(language)?tw:language.startsWith("zh")?zh:language.startsWith("vi")?vi:en;
}
export function deviceCheckError(error: unknown): DeviceCheckError {
 if(error instanceof Error && error.message==="DEVICE_CAPTURE_TIMEOUT")return "captureTimeout";
 const name=typeof error==="object"&&error!==null&&"name" in error?error.name:undefined;
 return name==="NotAllowedError"||name==="PermissionDeniedError"?"permissionDenied":name==="NotFoundError"||name==="DevicesNotFoundError"?"notFound":name==="NotReadableError"||name==="TrackStartError"?"inUse":"unavailable";
}
