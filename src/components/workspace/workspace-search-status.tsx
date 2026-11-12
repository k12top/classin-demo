"use client";
import styles from "./workspace.module.css";

type Source="classes"|"students"|"chats";
export type SearchSources=Record<Source,{loading:boolean;error:boolean}>;
export function searchSourcesIncomplete(sources:SearchSources){return Object.values(sources).some(source=>source.loading||source.error);}
const text={
 en:{loading:"Some search sources are still loading.",failed:"Some results may be missing. Retry:",retry:"Retry",classes:"Classes",students:"Students",chats:"Chats"},
 "zh-CN":{loading:"部分搜索数据仍在加载。",failed:"部分结果可能缺失，请重试：",retry:"重试",classes:"班级",students:"学生",chats:"聊天"},
 "zh-TW":{loading:"部分搜尋資料仍在載入。",failed:"部分結果可能缺失，請重試：",retry:"重試",classes:"班級",students:"學生",chats:"聊天"},
 vi:{loading:"Một số nguồn tìm kiếm vẫn đang tải.",failed:"Một số kết quả có thể bị thiếu. Thử lại:",retry:"Thử lại",classes:"Lớp học",students:"Học viên",chats:"Trò chuyện"},
} as const;
export function WorkspaceSearchStatus({locale,sources,retry}:{locale:string;sources:SearchSources;retry:Record<Source,()=>void>}){
 const copy=text[locale as keyof typeof text]??(locale.startsWith("zh")?text["zh-CN"]:text.en);
 const failed=(Object.keys(sources) as Source[]).filter(source=>sources[source].error);
 const loading=Object.values(sources).some(source=>source.loading&&!source.error);
 if(!failed.length&&!loading)return null;
 return <div className={styles.searchSourceStatus}>
  {loading&&<p role="status">{copy.loading}</p>}
  {failed.length>0&&<div role="alert"><span>{copy.failed}</span>{failed.map(source=><button type="button" key={source} aria-label={`${copy.retry} ${copy[source]}`} onClick={retry[source]}>{copy[source]}</button>)}</div>}
 </div>;
}
