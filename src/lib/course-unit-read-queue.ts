import {createWorkspaceReadQueue} from "./workspace-request-queue";

/** Both unit resources and assignment lists share the same read budget. */
export const enqueueCourseUnitRead=createWorkspaceReadQueue(4);
