import test from "node:test";
import assert from "node:assert/strict";
import {vi} from "../src/lib/i18n/locales/vi";
import {zhCN} from "../src/lib/i18n/locales/zh-CN";
import {zhTW} from "../src/lib/i18n/locales/zh-TW";
import {getTranslation} from "../src/lib/i18n/locales";

test("Vietnamese time-zone picker and scheduling messages cover every base key",()=>{
 assert.deepEqual(Object.keys(vi.timeZones).sort(),Object.keys(zhCN.timeZones).sort());
 for(const value of Object.values(vi.timeZones))assert.ok(value.trim());
 assert.equal(getTranslation(vi,"timeZones.results",{count:3}),"3 kết quả");
 assert.match(getTranslation(vi,"timeZones.remaining",{minutes:5}),/5/);
});

test("teaching staff settings have Vietnamese and Traditional Chinese copy",()=>{
 assert.equal(getTranslation(vi,"courseDetail.teachingTeachersTitle"),"Giáo viên giảng dạy");
 assert.equal(getTranslation(vi,"common.makeLeadTeacher"),"Đặt làm giáo viên chính");
 assert.equal(getTranslation(zhTW,"courseDetail.teacherSelectPlaceholder"),"選擇教師");
 assert.equal(getTranslation(zhTW,"courseDetail.saveTeacherSettings"),"儲存教師設定");
});
