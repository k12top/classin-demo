"use client";
import {ArrowUpRight,Home,CalendarDays,ListTodo,Folder,MessageCircle,Users,LayoutGrid,Plus,Globe2,Headphones,UserCircle,HelpCircle} from 'lucide-react';
import {searchWorkspaceFunctions,type WorkspaceFunctionId} from '@/lib/workspace-function-search';
import styles from './workspace.module.css';
export function WorkspaceFunctionResults({query,isTeacher,locale,onSelect}:{query:string;isTeacher:boolean;locale:string;onSelect:(id:WorkspaceFunctionId)=>void}){
 const icons={home:Home,calendar:CalendarDays,todo:ListTodo,files:Folder,chat:MessageCircle,students:Users,groups:LayoutGrid,create:Plus,createLesson:CalendarDays,join:Plus,settings:Globe2,devices:Headphones,account:UserCircle,about:HelpCircle};
 const results=searchWorkspaceFunctions(query,isTeacher,locale);if(!results.length)return null;
 return <section className={styles.functionResults} aria-label={locale==='vi'?'Chức năng':locale.startsWith('zh')?'功能':'Features'}><h3>{locale==='vi'?'Chức năng':locale.startsWith('zh')?'功能':'Features'}</h3>{results.map(result=>{const Icon=icons[result.id];return <button data-search-result type="button" key={result.id} onClick={()=>onSelect(result.id)}><Icon size={15} aria-hidden="true"/><span>{result.name}</span><ArrowUpRight size={14} aria-hidden="true"/></button>;})}</section>;
}
