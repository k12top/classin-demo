type Item={id:string};
type Page<T extends Item>={submissions?:T[];nextCursor?:string|null};

/** Preserve previously loaded older pages while replacing the newest page. */
export function mergeAssignmentSubmissionPage<T extends Item,P extends Page<T>>(current:P,next:P):P{
 const previous=current.submissions||[],fresh=next.submissions||[];
 if(previous.length<=100)return next;
 const seen=new Set(fresh.map(item=>item.id));
 return {...next,submissions:[...fresh,...previous.filter(item=>!seen.has(item.id))],nextCursor:current.nextCursor};
}
