export type WorkspaceFunctionId='home'|'chat'|'students'|'groups'|'todo'|'calendar'|'files'|'settings'|'account'|'devices'|'about'|'create'|'createLesson'|'join';
const functions:{id:WorkspaceFunctionId;zh:string;en:string;aliases:string;teacher?:boolean}[]=[
 {id:'home',zh:'首页',en:'Home',aliases:'班级 课程 classes courses'},
 {id:'calendar',zh:'课堂日历',en:'Calendar',aliases:'课表 排课 日程 schedule timetable calendar'},
 {id:'todo',zh:'待办事项',en:'To Do',aliases:'任务 作业 task assignment homework'},
 {id:'files',zh:'云盘',en:'Drive',aliases:'文件 资料 上传 下载 file upload download storage'},
 {id:'chat',zh:'聊天',en:'Chat',aliases:'消息 联系人 message contact'},
 {id:'students',zh:'学生管理',en:'Students',aliases:'人员 通讯录 roster people student',teacher:true},
 {id:'groups',zh:'分组管理',en:'Groups',aliases:'学生组 group',teacher:true},
 {id:'createLesson',zh:'新建课堂',en:'New lesson',aliases:'新增课节 排课 创建课堂 schedule create lesson',teacher:true},
 {id:'create',zh:'新建班级',en:'New class',aliases:'创建课程 新增课程 create course class',teacher:true},
 {id:'join',zh:'加入公开课',en:'Join public lesson',aliases:'口令 邀请码 invitation code join'},
 {id:'settings',zh:'语言与时区',en:'Language and time zone',aliases:'设置 国际化 翻译 language timezone translation settings'},
 {id:'devices',zh:'设备检测',en:'Device check',aliases:'摄像头 麦克风 声音 音频 视频 camera microphone audio video settings'},
 {id:'account',zh:'账号信息',en:'Account',aliases:'个人资料 头像 profile avatar account'},
 {id:'about',zh:'帮助与关于',en:'Help and about',aliases:'帮助 版本 help about version'},
];
const translatedNames:Record<string,Partial<Record<WorkspaceFunctionId,string>>>={
 'zh-TW':{home:'首頁',calendar:'課堂日曆',todo:'待辦事項',files:'雲端硬碟',chat:'聊天',students:'學生管理',groups:'分組管理',createLesson:'新增課堂',create:'新增班級',join:'加入公開課',settings:'語言與時區',devices:'裝置檢測',account:'帳號資訊',about:'說明與關於'},
 vi:{home:'Trang chủ',calendar:'Lịch',todo:'Việc cần làm',files:'Ổ đĩa',chat:'Trò chuyện',students:'Học viên',groups:'Nhóm',createLesson:'Tạo buổi học',create:'Tạo lớp',join:'Tham gia lớp công khai',settings:'Ngôn ngữ và múi giờ',devices:'Kiểm tra thiết bị',account:'Tài khoản',about:'Trợ giúp'},
};
export function searchWorkspaceFunctions(query:string,isTeacher:boolean,locale:string){
 const needle=query.trim().toLocaleLowerCase();
 return functions.filter(item=>(!item.teacher||isTeacher)&&(!needle||`${item.zh} ${item.en} ${translatedNames[locale]?.[item.id]||""} ${item.aliases}`.toLocaleLowerCase().includes(needle))).slice(0,needle?14:5).map(item=>({id:item.id,name:translatedNames[locale]?.[item.id]||(locale.startsWith('zh')?item.zh:item.en)}));
}
