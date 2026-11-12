/** The course-detail API only emits this marker after checking the session roster. */
export function hasCourseEntryAccess(input:{canTeach:boolean;directStudent:boolean;groupStudent:boolean;limitedToSessionId?:string|null}):boolean {
 return input.canTeach||input.directStudent||input.groupStudent||Boolean(input.limitedToSessionId);
}
