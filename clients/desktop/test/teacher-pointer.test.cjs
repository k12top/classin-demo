'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createTeacherPointer}=require('../src/teacher-pointer.cjs');
class FakeWindow {
 constructor(options){this.options=options;this.messages=[];this.webContents={setWindowOpenHandler:fn=>this.handler=fn,on:()=>{},send:channel=>this.messages.push(channel)};this.destroyed=false;FakeWindow.instances.push(this);}
 isDestroyed(){return this.destroyed;} setIgnoreMouseEvents(...args){this.ignore=args;} setAlwaysOnTop(...args){this.top=args;} setVisibleOnAllWorkspaces(...args){this.workspaces=args;}
 loadURL(url){this.url=url;return Promise.resolve();} setPosition(x,y){this.pos=[x,y];} showInactive(){this.shown=true;} hide(){this.shown=false;} close(){this.destroyed=true;}
}
FakeWindow.instances=[];
test('teacher marker follows the verified shared display without intercepting input',()=>{
 const pointer=createTeacherPointer({BrowserWindow:FakeWindow,url:'classroom-client://teacher-pointer/index.html'});
 pointer.show({bounds:{x:-1920,y:20,width:1920,height:1080}},{x:.5,y:.5});
 const win=FakeWindow.instances.at(-1);assert.deepEqual(win.pos,[-960,560]);assert.deepEqual(win.ignore,[true,{forward:true}]);assert.equal(win.options.focusable,false);assert.equal(win.shown,true);
 pointer.show({bounds:{x:-1920,y:20,width:1920,height:1080}},{x:1,y:1});assert.deepEqual(win.pos,[-1,1099]);pointer.show({bounds:{x:0,y:0,width:100,height:100}},{x:2,y:0});assert.deepEqual(win.pos,[-1,1099]);pointer.close();assert.equal(win.destroyed,true);
});

test('click feedback is delivered after the indicator finishes loading',async()=>{
 const pointer=createTeacherPointer({BrowserWindow:FakeWindow,url:'classroom-client://teacher-pointer/index.html'}),display={bounds:{x:0,y:0,width:100,height:100}};
 pointer.show(display,{type:'button',down:true,x:.3,y:.4});const win=FakeWindow.instances.at(-1);assert.deepEqual(win.messages,[]);await Promise.resolve();assert.deepEqual(win.messages,['teacher-pointer:click']);pointer.show(display,{type:'move',x:.5,y:.5});assert.equal(win.messages.length,1);pointer.show(display,{type:'button',down:true,x:.5,y:.5});assert.equal(win.messages.length,2);pointer.close();
});
