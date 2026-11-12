#pragma once
#include "RemoteInputProtocol.hpp"
#include <vector>

namespace classroom {
inline bool selfTest() {
  if(keys().size()!=99||keys().at("KeyA").scan!=0x1e||!keys().at("NumpadEnter").extended||keys().at("Enter").extended)return false;
  std::set<std::pair<unsigned short,bool>> scans;
  for(const auto& key:keys()){
    if(!key.second.scan||!scans.emplace(key.second.scan,key.second.extended).second)return false;
    if(!command("{\"type\":\"event\",\"event\":{\"type\":\"key\",\"code\":\""+key.first+"\",\"down\":true}}").valid)return false;
  }
  if(!command(R"({"type":"renew"})").valid||!command(R"({"type":"event","event":{"type":"move","x":1e-7,"y":1}})").valid||!command(R"({"type":"event","event":{"type":"wheel","x":0,"y":1,"deltaX":-1200,"deltaY":1200}})").valid)return false;
  for(const auto* invalid:{
    R"({"type":"renew","extra":1})",R"({"type":"renew","type":"renew"})",R"({"type":"renew"} trailing)",R"({"type":"renew",})",R"([])",R"(null)",R"({"type":"event","event":{"type":"key","code":"KeyA","down":1}})",
    R"({"type":"event","event":{"type":"move","x":true,"y":0}})",R"({"type":"event","event":{"type":"move","x":-0.1,"y":0}})",R"({"type":"event","event":{"type":"move","x":0,"y":1.01}})",R"({"type":"event","event":{"type":"move","x":1e999,"y":0}})",R"({"type":"event","event":{"type":"move","x":01,"y":0}})",R"({"type":"event","event":{"type":"move","x":.1,"y":0}})",
    R"({"type":"event","event":{"type":"key","code":"ShellCommand","down":true}})",R"({"type":"event","event":{"type":"key","code":"Key\u0041","down":true}})",R"({"type":"event","event":{"type":"move","x":{},"y":0}})",R"({"type":"event","event":{"type":"wheel","x":0,"y":0,"deltaX":0,"deltaY":0}})",R"({"type":"event","event":{"type":"wheel","x":0,"y":0,"deltaX":0,"deltaY":1201}})",R"({"type":"event","event":{"type":"button","x":0,"y":0,"button":"extra","down":true}})"
  })if(command(invalid).valid)return false;
  if(command(std::string(4097,' ')).valid)return false;
  if(pixel(0,-3840,3840)!=-3840||pixel(1,-3840,3840)!=-1||pixel(.5,0,3840)!=1920)return false;
  if(!nearRect({-3393,0,0,1909},{-3392,0,0,1908},4)||nearRect({-3393,0,0,1909},{-3392,0,0,1908},0)||nearRect({0,0,1920,1080},{1920,0,3840,1080},4))return false;
  struct TestSink:Sink {
    bool succeeds=true;std::vector<Event> events;std::vector<std::string> releasedKeys,releasedButtons;
    bool apply(const Event& event)override{events.push_back(event);return succeeds;}
    void releaseKey(const std::string& key)override{releasedKeys.push_back(key);}
    void releaseButton(const std::string& button)override{releasedButtons.push_back(button);}
  };
  const auto down=command(R"({"type":"event","event":{"type":"key","code":"KeyA","down":true}})");
  const auto up=command(R"({"type":"event","event":{"type":"key","code":"KeyA","down":false}})");
  const auto button=command(R"({"type":"event","event":{"type":"button","x":0,"y":0,"button":"left","down":true}})");
  {
    TestSink sink;InputSession session(sink,0);
    if(!session.accept(down,1)||!session.accept(button,2)||session.tick(2500))return false;
    if(sink.releasedKeys!=std::vector<std::string>{"KeyA"}||sink.releasedButtons!=std::vector<std::string>{"left"})return false;
    if(session.accept(command(R"({"type":"renew"})"),2501))return false;
    session.close();if(sink.releasedKeys.size()!=1)return false;
  }
  {
    TestSink sink;InputSession session(sink,0);
    if(!session.accept(down,1)||session.accept(down,2)||sink.events.size()!=1||sink.releasedKeys.size()!=1)return false;
  }
  {
    TestSink sink;InputSession session(sink,0);if(session.accept(up,1)||!sink.events.empty())return false;
  }
  {
    TestSink sink;sink.succeeds=false;InputSession session(sink,0);if(session.accept(down,1)||sink.releasedKeys.size()!=1)return false;
  }
  {
    TestSink sink;InputSession session(sink,0);if(!session.accept(down,1))return false;sink.succeeds=false;if(session.accept(up,2)||sink.releasedKeys.size()!=1)return false;
  }
  {
    TestSink sink;InputSession session(sink,0);if(!session.accept(button,1)||session.tick(2,false)||sink.releasedButtons.size()!=1)return false;
  }
  {
    TestSink sink;InputSession session(sink,0);const auto move=command(R"({"type":"event","event":{"type":"move","x":0,"y":0}})");
    for(unsigned i=0;i<256;i++)if(!session.accept(move,1))return false;
    if(session.accept(move,1))return false;
  }
  return true;
}
} // namespace classroom
