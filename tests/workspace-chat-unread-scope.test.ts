import assert from "node:assert/strict";
import test from "node:test";
import {workspaceUnreadScope,workspaceUnreadForScope} from "../src/lib/workspace-chat-unread-scope";

test("unread counts follow the current authorized course scope",()=>{
 const scope=workspaceUnreadScope(["b","a","a"]),state={scope,counts:{a:2,b:3}};
 assert.equal(scope,workspaceUnreadScope(["a","b"]));
 assert.deepEqual(workspaceUnreadForScope(state,scope),{a:2,b:3});
 assert.deepEqual(workspaceUnreadForScope(state,workspaceUnreadScope(["a"])),{});
 assert.deepEqual(workspaceUnreadForScope(state,workspaceUnreadScope([])),{});
});
