/** Explicit rules retain deviations from the inherited class roster.
 * Exclusions for non-direct members may still be needed for group membership. */
export function needsSessionRosterRule(mode:"inherit"|"custom",selected:boolean,inherited:boolean):boolean {
 return mode==="custom" || !selected || !inherited;
}

/** Do not turn an unsupported staff role into an assistant through legacy editors. */
export function supportedSessionTeacherRules(value:unknown):boolean {
 if(value===undefined)return true;
 return Array.isArray(value)&&value.every(item=>item!==null&&typeof item==="object"&&!Array.isArray(item)&&(item.role===undefined||item.role==="teacher"||item.role==="assistant"));
}
