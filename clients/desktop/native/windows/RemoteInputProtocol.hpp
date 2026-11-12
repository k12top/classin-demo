#pragma once
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <initializer_list>
#include <map>
#include <set>
#include <string>
#include <string_view>

namespace classroom {
struct Key { unsigned short scan; bool extended = false; };
inline const std::map<std::string, Key>& keys() {
  static const std::map<std::string, Key> value = {
    {"KeyA",{0x1e}},{"KeyB",{0x30}},{"KeyC",{0x2e}},{"KeyD",{0x20}},{"KeyE",{0x12}},{"KeyF",{0x21}},{"KeyG",{0x22}},{"KeyH",{0x23}},{"KeyI",{0x17}},{"KeyJ",{0x24}},{"KeyK",{0x25}},{"KeyL",{0x26}},{"KeyM",{0x32}},{"KeyN",{0x31}},{"KeyO",{0x18}},{"KeyP",{0x19}},{"KeyQ",{0x10}},{"KeyR",{0x13}},{"KeyS",{0x1f}},{"KeyT",{0x14}},{"KeyU",{0x16}},{"KeyV",{0x2f}},{"KeyW",{0x11}},{"KeyX",{0x2d}},{"KeyY",{0x15}},{"KeyZ",{0x2c}},
    {"Digit0",{0x0b}},{"Digit1",{0x02}},{"Digit2",{0x03}},{"Digit3",{0x04}},{"Digit4",{0x05}},{"Digit5",{0x06}},{"Digit6",{0x07}},{"Digit7",{0x08}},{"Digit8",{0x09}},{"Digit9",{0x0a}},
    {"Enter",{0x1c}},{"Tab",{0x0f}},{"Space",{0x39}},{"Backspace",{0x0e}},{"Escape",{0x01}},{"Delete",{0x53,true}},{"Home",{0x47,true}},{"End",{0x4f,true}},{"PageUp",{0x49,true}},{"PageDown",{0x51,true}},{"Insert",{0x52,true}},
    {"ArrowLeft",{0x4b,true}},{"ArrowRight",{0x4d,true}},{"ArrowDown",{0x50,true}},{"ArrowUp",{0x48,true}},
    {"Minus",{0x0c}},{"Equal",{0x0d}},{"BracketLeft",{0x1a}},{"BracketRight",{0x1b}},{"Backslash",{0x2b}},{"Semicolon",{0x27}},{"Quote",{0x28}},{"Backquote",{0x29}},{"Comma",{0x33}},{"Period",{0x34}},{"Slash",{0x35}},
    {"ShiftLeft",{0x2a}},{"ShiftRight",{0x36}},{"ControlLeft",{0x1d}},{"ControlRight",{0x1d,true}},{"AltLeft",{0x38}},{"AltRight",{0x38,true}},{"MetaLeft",{0x5b,true}},{"MetaRight",{0x5c,true}},{"CapsLock",{0x3a}},
    {"F1",{0x3b}},{"F2",{0x3c}},{"F3",{0x3d}},{"F4",{0x3e}},{"F5",{0x3f}},{"F6",{0x40}},{"F7",{0x41}},{"F8",{0x42}},{"F9",{0x43}},{"F10",{0x44}},{"F11",{0x57}},{"F12",{0x58}},
    {"Numpad0",{0x52}},{"Numpad1",{0x4f}},{"Numpad2",{0x50}},{"Numpad3",{0x51}},{"Numpad4",{0x4b}},{"Numpad5",{0x4c}},{"Numpad6",{0x4d}},{"Numpad7",{0x47}},{"Numpad8",{0x48}},{"Numpad9",{0x49}},{"NumpadAdd",{0x4e}},{"NumpadSubtract",{0x4a}},{"NumpadMultiply",{0x37}},{"NumpadDivide",{0x35,true}},{"NumpadDecimal",{0x53}},{"NumpadEnter",{0x1c,true}}
  };
  return value;
}

// This is a deliberately small JSON *protocol*, not a general JSON reader:
// only objects, finite numbers, booleans and unescaped ASCII identifiers are
// accepted. All string values are fixed event/key names produced by the main
// process; text, executable paths and arbitrary commands are never accepted.
struct Value {
  enum Kind { invalid, object, text, number, boolean } kind = invalid;
  std::map<std::string, Value> fields;
  std::string string;
  double numeric = 0;
  bool flag = false;
};
class Parser {
  std::string_view input; size_t offset = 0;
  void whitespace() { while (offset < input.size() && (input[offset]==' '||input[offset]=='\t'||input[offset]=='\r'||input[offset]=='\n')) ++offset; }
  std::string string() {
    if (offset >= input.size() || input[offset++] != '"') return {};
    std::string result;
    while (offset < input.size()) {
      const unsigned char c = input[offset++];
      if (c == '"') return result;
      if (c < 32 || c > 126 || c == '\\' || result.size() >= 80) return {};
      result += static_cast<char>(c);
    }
    return {};
  }
  Value value(unsigned depth) {
    whitespace(); Value result;
    if (offset >= input.size()) return result;
    if (input[offset] == '{') {
      if (depth > 1) return result;
      result.kind = Value::object; ++offset; whitespace();
      if (offset < input.size() && input[offset] == '}') { ++offset; return result; }
      while (offset < input.size()) {
        whitespace(); auto name = string(); whitespace();
        if (name.empty() || offset >= input.size() || input[offset++] != ':' || result.fields.size() >= 8) return {};
        auto child = value(depth + 1);
        if (child.kind == Value::invalid || !result.fields.emplace(name,std::move(child)).second) return {};
        whitespace(); if (offset >= input.size()) return {};
        const char next = input[offset++];
        if (next == '}') return result;
        if (next != ',') return {};
      }
      return {};
    }
    if (input[offset] == '"') { result.string = string(); if (!result.string.empty()) result.kind = Value::text; return result; }
    for (const auto* literal : {"true","false"}) {
      const std::string_view token(literal);
      if (input.substr(offset,token.size()) == token) { offset += token.size(); result.kind=Value::boolean; result.flag=token=="true"; return result; }
    }
    const size_t begin=offset;
    if (input[offset]=='-') ++offset;
    const auto digit=[&] { return offset<input.size() && input[offset]>='0' && input[offset]<='9'; };
    if (!digit()) return {};
    if (input[offset]=='0') ++offset; else while (digit()) ++offset;
    if (offset<input.size() && input[offset]=='.') { ++offset; if (!digit()) return {}; while(digit())++offset; }
    if (offset<input.size() && (input[offset]=='e'||input[offset]=='E')) { ++offset; if(offset<input.size()&&(input[offset]=='+'||input[offset]=='-'))++offset; if(!digit())return{};while(digit())++offset; }
    const std::string token(input.substr(begin,offset-begin)); char* end=nullptr;
    result.numeric=std::strtod(token.c_str(),&end);
    if (!end || *end || !std::isfinite(result.numeric)) return {};
    result.kind=Value::number;return result;
  }
public:
  explicit Parser(std::string_view bytes):input(bytes){}
  Value parse(){ if(input.empty()||input.size()>4096)return{};auto result=value(0);whitespace();return offset==input.size()?result:Value{}; }
};
inline const Value& field(const Value& v,const char* key){static const Value missing;const auto it=v.fields.find(key);return it==v.fields.end()?missing:it->second;}
inline bool exact(const Value& v,std::initializer_list<const char*> names){if(v.kind!=Value::object||v.fields.size()!=names.size())return false;for(auto name:names)if(!v.fields.count(name))return false;return true;}
struct Event { std::string type,code,button;bool down=false;double x=0,y=0,deltaX=0,deltaY=0; };
struct Command { bool valid=false,renew=false;Event event; };
inline Command command(std::string_view bytes){
  const auto root=Parser(bytes).parse();const auto& kind=field(root,"type");if(kind.kind!=Value::text)return{};
  if(kind.string=="renew"&&exact(root,{"type"})){Command result;result.valid=result.renew=true;return result;}
  if(kind.string!="event"||!exact(root,{"type","event"}))return{};
  const auto& value=field(root,"event");const auto& type=field(value,"type");if(type.kind!=Value::text)return{};
  Event event;event.type=type.string;
  if(event.type=="key"){
    const auto& code=field(value,"code");const auto& down=field(value,"down");
    if(!exact(value,{"type","code","down"})||code.kind!=Value::text||!keys().count(code.string)||down.kind!=Value::boolean)return{};
    event.code=code.string;event.down=down.flag;
  }else{
    const auto& x=field(value,"x");const auto& y=field(value,"y");
    if(x.kind!=Value::number||y.kind!=Value::number||x.numeric<0||x.numeric>1||y.numeric<0||y.numeric>1)return{};
    event.x=x.numeric;event.y=y.numeric;
    if(event.type=="move"){if(!exact(value,{"type","x","y"}))return{};}
    else if(event.type=="button"){
      const auto& button=field(value,"button");const auto& down=field(value,"down");
      if(!exact(value,{"type","x","y","button","down"})||button.kind!=Value::text||(button.string!="left"&&button.string!="right"&&button.string!="middle")||down.kind!=Value::boolean)return{};
      event.button=button.string;event.down=down.flag;
    }else if(event.type=="wheel"){
      const auto& dx=field(value,"deltaX");const auto& dy=field(value,"deltaY");
      if(!exact(value,{"type","x","y","deltaX","deltaY"})||dx.kind!=Value::number||dy.kind!=Value::number||std::abs(dx.numeric)>1200||std::abs(dy.numeric)>1200||(dx.numeric==0&&dy.numeric==0))return{};
      event.deltaX=dx.numeric;event.deltaY=dy.numeric;
    }else return{};
  }
  Command result;result.valid=true;result.event=event;return result;
}
struct Sink { virtual bool apply(const Event&)=0;virtual void releaseKey(const std::string&)=0;virtual void releaseButton(const std::string&)=0;virtual ~Sink()=default; };
class InputSession {
  Sink& sink;std::set<std::string> heldKeys,heldButtons;unsigned long long deadline,windowStart;unsigned count=0;bool closed=false;
public:
  InputSession(Sink& sink,unsigned long long now):sink(sink),deadline(now+2500),windowStart(now){}
  void close(){if(closed)return;closed=true;for(const auto& key:heldKeys)sink.releaseKey(key);for(const auto& button:heldButtons)sink.releaseButton(button);heldKeys.clear();heldButtons.clear();}
  bool tick(unsigned long long now,bool displayValid=true){if(closed)return false;if(!displayValid||now>=deadline){close();return false;}return true;}
  bool accept(const Command& value,unsigned long long now){
    if(!tick(now)||!value.valid){close();return false;}
    if(now-windowStart>=1000){windowStart=now;count=0;}if(++count>256){close();return false;}
    if(value.renew){deadline=now+2500;return true;}
    const auto& event=value.event;
    auto* held=event.type=="key"?&heldKeys:event.type=="button"?&heldButtons:nullptr;
    const auto& name=event.type=="key"?event.code:event.button;
    if(held){if(event.down==bool(held->count(name))){close();return false;}if(event.down)held->insert(name);}
    if(!sink.apply(event)){close();return false;}
    if(held&&!event.down)held->erase(name);
    return true;
  }
};
inline long long pixel(double normalized,long long origin,long long size){return origin+std::min(size-1,static_cast<long long>(std::floor(normalized*size)));}
struct PixelRect {long long left,top,right,bottom;};
inline bool nearRect(const PixelRect& a,const PixelRect& b,long long tolerance){return tolerance>=0&&tolerance<=16&&std::abs(a.left-b.left)<=tolerance&&std::abs(a.top-b.top)<=tolerance&&std::abs(a.right-b.right)<=tolerance&&std::abs(a.bottom-b.bottom)<=tolerance;}
} // namespace classroom
