/** Display stored instants in the user's selected zone, including DST changes. */
export function activityDisplayTime(instant:string,locale:string,timeZone:string):string{
 return new Intl.DateTimeFormat(locale,{timeZone,hour:"2-digit",minute:"2-digit"}).format(new Date(instant));
}
