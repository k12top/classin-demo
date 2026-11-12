import Foundation
import CoreGraphics
import ApplicationServices
import Carbon.HIToolbox

// Internal helper: stdin is exclusively owned by the desktop main process.
// The main process must verify the student's consent, live grant and capture
// display before starting it. A helper must never be exposed to a web page.
private let keyCodes: [String: CGKeyCode] = [
 "KeyA":0,"KeyB":11,"KeyC":8,"KeyD":2,"KeyE":14,"KeyF":3,"KeyG":5,"KeyH":4,"KeyI":34,"KeyJ":38,"KeyK":40,"KeyL":37,"KeyM":46,"KeyN":45,"KeyO":31,"KeyP":35,"KeyQ":12,"KeyR":15,"KeyS":1,"KeyT":17,"KeyU":32,"KeyV":9,"KeyW":13,"KeyX":7,"KeyY":16,"KeyZ":6,
 "Digit0":29,"Digit1":18,"Digit2":19,"Digit3":20,"Digit4":21,"Digit5":23,"Digit6":22,"Digit7":26,"Digit8":28,"Digit9":25,
 "Enter":36,"Tab":48,"Space":49,"Backspace":51,"Escape":53,"Delete":117,"Home":115,"End":119,"PageUp":116,"PageDown":121,"Insert":114,
 "ArrowLeft":123,"ArrowRight":124,"ArrowDown":125,"ArrowUp":126,"Minus":27,"Equal":24,"BracketLeft":33,"BracketRight":30,"Backslash":42,"Semicolon":41,"Quote":39,"Backquote":50,"Comma":43,"Period":47,"Slash":44,
 "ShiftLeft":56,"ShiftRight":60,"ControlLeft":59,"ControlRight":62,"AltLeft":58,"AltRight":61,"MetaLeft":55,"MetaRight":54,"CapsLock":57,
 "F1":122,"F2":120,"F3":99,"F4":118,"F5":96,"F6":97,"F7":98,"F8":100,"F9":101,"F10":109,"F11":103,"F12":111,
 "Numpad0":82,"Numpad1":83,"Numpad2":84,"Numpad3":85,"Numpad4":86,"Numpad5":87,"Numpad6":88,"Numpad7":89,"Numpad8":91,"Numpad9":92,"NumpadAdd":69,"NumpadSubtract":78,"NumpadMultiply":67,"NumpadDivide":75,"NumpadDecimal":65,"NumpadEnter":76
]
private let modifiers: [String: CGEventFlags] = ["ShiftLeft":.maskShift,"ShiftRight":.maskShift,"ControlLeft":.maskControl,"ControlRight":.maskControl,"AltLeft":.maskAlternate,"AltRight":.maskAlternate,"MetaLeft":.maskCommand,"MetaRight":.maskCommand]
private func selfTest() -> Bool { keyCodes.count == 99 && keyCodes["KeyA"] == 0 && keyCodes["ArrowLeft"] == 123 && keyCodes["NumpadEnter"] == 76 }
private func timerOnQueue(_ queue: DispatchQueue, _ handler: @escaping @Sendable () -> Void) -> DispatchSourceTimer {
 let timer=DispatchSource.makeTimerSource(queue:queue)
 timer.schedule(deadline: .now() + .milliseconds(100),repeating:.milliseconds(100))
 timer.setEventHandler(handler: handler)
 timer.resume()
 return timer
}
if CommandLine.arguments.contains("--self-test-timer") {
 let completed=DispatchSemaphore(value:0)
 let timer=timerOnQueue(DispatchQueue(label:"classroom.remote-input.test"), { @Sendable in completed.signal() })
 let ok=completed.wait(timeout:.now()+2) == .success
 timer.cancel();print(ok ? "ok" : "failed");exit(ok ? 0 : 1)
}
if CommandLine.arguments.contains("--self-test") { print(selfTest() ? "ok" : "failed"); exit(selfTest() ? 0 : 1) }
guard CommandLine.arguments.count == 2, let display = UInt32(CommandLine.arguments[1]) else { fputs("unavailable\n", stderr); exit(1) }
guard AXIsProcessTrusted() else { print("permission-required"); fflush(stdout); exit(3) }
guard CGDisplayIsActive(display) != 0 else { fputs("unavailable\n", stderr); exit(1) }
let initialBounds = CGDisplayBounds(display)
guard initialBounds.width >= 1, initialBounds.height >= 1 else { exit(1) }
let queue = DispatchQueue(label:"classroom.remote-input")
final class RemoteInputState: @unchecked Sendable {
 let display:CGDirectDisplayID,initialBounds:CGRect
 var heldKeys=Set<String>(),heldButtons=Set<String>(),lastPoint:CGPoint,deadline:UInt64,closed=false
 init(display:CGDirectDisplayID,bounds:CGRect){self.display=display;self.initialBounds=bounds;self.lastPoint=CGPoint(x:bounds.midX,y:bounds.midY);self.deadline=DispatchTime.now().uptimeNanoseconds + 2_500_000_000}
func flags() -> CGEventFlags { heldKeys.reduce(CGEventFlags()) { $0.union(modifiers[$1] ?? []) } }
func postKey(_ code:String,_ down:Bool) -> Bool {
 guard let key=keyCodes[code],let event=CGEvent(keyboardEventSource:nil,virtualKey:key,keyDown:down) else { return false }
 event.flags=flags(); event.post(tap:.cghidEventTap); return true
}
func button(_ name:String)->CGMouseButton? { switch name {case "left":return .left;case "right":return .right;case "middle":return .center;default:return nil} }
func postButton(_ name:String,_ down:Bool,_ point:CGPoint)->Bool {
 guard let value=button(name) else{return false}; let kind:CGEventType = value == .left ? (down ? .leftMouseDown : .leftMouseUp) : value == .right ? (down ? .rightMouseDown : .rightMouseUp) : (down ? .otherMouseDown : .otherMouseUp)
 guard let event=CGEvent(mouseEventSource:nil,mouseType:kind,mouseCursorPosition:point,mouseButton:value) else{return false};event.flags=flags();event.post(tap:.cghidEventTap);return true
}
func shutdown(_ status:Int32) { if closed{return};closed=true;let cursor=CGEvent(source:nil)?.location ?? lastPoint;for name in heldButtons { _=postButton(name,false,cursor) };heldButtons.removeAll();for key in Array(heldKeys) { heldKeys.remove(key);_=postKey(key,false) };exit(status) }
func now()->UInt64 { DispatchTime.now().uptimeNanoseconds }
func validDisplay()->Bool { CGDisplayIsActive(display) != 0 && CGDisplayBounds(display).equalTo(initialBounds) && AXIsProcessTrusted() }
func remotePoint(_ event:[String:Any])->CGPoint? {
 guard let x=event["x"] as? Double,let y=event["y"] as? Double,x.isFinite,y.isFinite,(0...1).contains(x),(0...1).contains(y) else{return nil}
 return CGPoint(x:initialBounds.minX+min(initialBounds.width-1,floor(x*initialBounds.width)),y:initialBounds.minY+min(initialBounds.height-1,floor(y*initialBounds.height)))
}
func handle(_ command:[String:Any]) {
 guard !closed else{return}; guard validDisplay() else { shutdown(1);return }
 if command["type"] as? String == "renew" { deadline=now()+2_500_000_000;return }
 guard deadline>now(),command["type"] as? String == "event",let event=command["event"] as? [String:Any],let type=event["type"] as? String else{shutdown(1);return}
 switch type {
 case "key":
  guard let code=event["code"] as? String,let down=event["down"] as? Bool,keyCodes[code] != nil,down ? !heldKeys.contains(code) : heldKeys.contains(code) else{shutdown(1);return}
  if down{heldKeys.insert(code)}else{heldKeys.remove(code)};if !postKey(code,down){if !down{heldKeys.insert(code)};shutdown(1)}
 case "move", "button", "wheel":
  guard let point=remotePoint(event) else{shutdown(1);return};lastPoint=point
  if type=="move" {let pressed=heldButtons.first,mouse=pressed.flatMap(button) ?? .left;let kind:CGEventType = pressed == "left" ? .leftMouseDragged : pressed == "right" ? .rightMouseDragged : pressed == "middle" ? .otherMouseDragged : .mouseMoved;guard let value=CGEvent(mouseEventSource:nil,mouseType:kind,mouseCursorPosition:point,mouseButton:mouse) else{shutdown(1);return};value.flags=flags();value.post(tap:.cghidEventTap)}
  else if type=="button" {guard let name=event["button"] as? String,let down=event["down"] as? Bool,button(name) != nil,down ? !heldButtons.contains(name) : heldButtons.contains(name) else{shutdown(1);return};if down{heldButtons.insert(name)}else{heldButtons.remove(name)};if !postButton(name,down,point){if !down{heldButtons.insert(name)};shutdown(1)}}
  else {guard let dx=event["deltaX"] as? Double,let dy=event["deltaY"] as? Double,dx.isFinite,dy.isFinite,abs(dx)<=1200,abs(dy)<=1200,let value=CGEvent(scrollWheelEvent2Source:nil,units:.pixel,wheelCount:2,wheel1:Int32(-dy),wheel2:Int32(-dx),wheel3:0) else{shutdown(1);return};value.location=point;value.flags=flags();value.post(tap:.cghidEventTap)}
 default:shutdown(1)
 }
}
func checkDeadline(){if now() >= deadline { shutdown(1) }}
}
let state=RemoteInputState(display:display,bounds:initialBounds)
signal(SIGTERM,SIG_IGN);signal(SIGINT,SIG_IGN)
let term=DispatchSource.makeSignalSource(signal:SIGTERM,queue:queue);term.setEventHandler(handler: { @Sendable in state.shutdown(0) });term.resume()
let interrupt=DispatchSource.makeSignalSource(signal:SIGINT,queue:queue);interrupt.setEventHandler(handler: { @Sendable in state.shutdown(0) });interrupt.resume()
let timer=timerOnQueue(queue, { @Sendable in state.checkDeadline() })
DispatchQueue.global(qos:.userInteractive).async { while let line=readLine(){if line.utf8.count>4096 {queue.sync {state.shutdown(1)};return};guard let bytes=line.data(using:.utf8),let command=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any] else{queue.sync {state.shutdown(1)};return};queue.sync {state.handle(command)}};queue.sync {state.shutdown(0)} }
fputs("ready\n", stdout)
fflush(stdout)
dispatchMain()
