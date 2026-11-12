"use client";
import {Avatar,AvatarFallback,AvatarImage} from '@/components/ui/avatar';
import {avatarInitials} from '@/lib/user-avatar';
import type {CoursePreviewMember} from '@/lib/course-member-preview';
import styles from './course-workspace.module.css';
export function CourseMemberPreview({members,locale,onSelect}:{members:CoursePreviewMember[];locale:string;onSelect:(id:string)=>void}){
 const label=locale==='zh-TW'?'查看學生':locale.startsWith('zh')?'查看学生':locale==='vi'?'Xem học viên':'View student';
 return <div className={styles.memberPreview}>{members.slice(0,6).map(member=><button className={styles.memberButton} key={member.id} type="button" aria-label={`${label} ${member.name}`} title={member.name} onClick={()=>onSelect(member.id)}><Avatar className={styles.memberAvatar}><AvatarImage src={member.avatar} alt=""/><AvatarFallback className={styles.memberInitials}>{avatarInitials(member.name)}</AvatarFallback></Avatar></button>)}</div>;
}
