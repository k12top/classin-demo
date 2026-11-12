import test from "node:test";
import assert from "node:assert/strict";
import {courseActivitySummaryText,courseWorkspaceText} from "../src/components/workspace/course-workspace-copy";

test("course navigation and important recovery actions follow the selected language",()=>{
 assert.equal(courseWorkspaceText("zh-TW","教学人员","Teaching staff"),"教學人員");
 assert.equal(courseWorkspaceText("vi","进入旁听","Observe"),"Vào dự thính");
 assert.equal(courseWorkspaceText("vi","单元加载失败","Unable to load units"),"Không thể tải học phần");
 assert.equal(courseWorkspaceText("zh-CN","教学人员","Teaching staff"),"教学人员");
 assert.equal(courseWorkspaceText("en","教学人员","Teaching staff"),"Teaching staff");
 assert.equal(courseWorkspaceText("vi","移动到单元","Move to unit"),"Chuyển đến học phần");
 assert.equal(courseWorkspaceText("zh-TW","作业草稿","Assignment drafts"),"作業草稿");
 assert.equal(courseWorkspaceText("vi","添加资料","Add resource"),"Thêm tài liệu");
 assert.equal(courseWorkspaceText("zh-TW","重试确认","Retry to confirm"),"重試確認");
});

test("lesson staff roles and recovery notices use the selected language",()=>{
 assert.equal(courseWorkspaceText("zh-TW","授课教师","Lead teacher"),"授課教師");
 assert.equal(courseWorkspaceText("vi","旁听","Observer"),"Người dự thính");
 assert.equal(courseWorkspaceText("vi","选择多节课","Multiple lessons"),"Nhiều buổi học");
 assert.match(courseWorkspaceText("zh-TW","授权结果暂不确定","The result is uncertain. Retry to confirm; reopen this form to continue."),/無法確認授權結果/);
});

test("PDF preview controls and errors follow the selected language",()=>{
 assert.equal(courseWorkspaceText("zh-TW","上一页","Previous page"),"上一頁");
 assert.equal(courseWorkspaceText("vi","下一页","Next page"),"Trang tiếp");
 assert.equal(courseWorkspaceText("vi","第 {page} 页","Page {page}").replace("{page}","2"),"Trang 2");
 assert.match(courseWorkspaceText("zh-TW","PDF 无法预览","Unable to preview this PDF. Check your connection and retry, or download it."),/無法預覽 PDF/);
});

test("review editing notice follows the selected language",()=>{
 const zh="此作业已不在待批改列表中；请先完成或关闭当前编辑。";
 const en="This assignment is no longer awaiting review. Finish or close the current edit first.";
 assert.equal(courseWorkspaceText("zh-CN",zh,en),zh);
 assert.equal(courseWorkspaceText("en",zh,en),en);
 assert.match(courseWorkspaceText("zh-TW",zh,en),/待批改清單/);
 assert.match(courseWorkspaceText("vi",zh,en),/danh sách chờ chấm/);
});

test("lesson summary copy keeps withheld accuracy distinct from zero and uses the student scope",()=>{
 const student={canManage:false,participants:42,submissions:1,accuracy:null};
 assert.equal(courseActivitySummaryText("vi",student),"Câu trả lời của tôi 1 · Độ chính xác —");
 assert.equal(courseActivitySummaryText("zh-TW",student),"我的作答 1 · 正確率 —");
 assert.equal(courseActivitySummaryText("en",{...student,accuracy:0}),"My responses 1 · Accuracy 0%");
 assert.doesNotMatch(courseActivitySummaryText("en",student),/42|participants|0%/);
});

test("teacher summary formats locale numbers and the lesson schedule has no management claim",()=>{
 assert.equal(courseActivitySummaryText("en",{canManage:true,participants:1,submissions:3,accuracy:50}),"1 participant · Accuracy 50%");
 assert.equal(courseActivitySummaryText("vi",{canManage:true,participants:1200,submissions:3,accuracy:66.7}),"1.200 người tham gia · Độ chính xác 66,7%");
 assert.equal(courseWorkspaceText("vi","课节安排","Lesson schedule"),"Lịch học");
 assert.equal(courseWorkspaceText("zh-TW","正在加载统计…","Loading statistics…"),"正在載入統計…");
});
