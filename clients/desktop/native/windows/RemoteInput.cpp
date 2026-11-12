#include "RemoteInputSelfTest.hpp"
#include <iostream>

#if defined(_WIN32) && !defined(CLASSROOM_PROTOCOL_ONLY)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <chrono>
#include <atomic>
#include <cerrno>
#include <climits>
#include <mutex>
#include <thread>

namespace {
std::atomic_bool interrupted{false};
BOOL WINAPI consoleControl(DWORD){interrupted.store(true);return TRUE;}
struct Monitor {
  RECT bounds{},actualBounds{};long long tolerance=0;HMONITOR handle=nullptr;std::wstring device;DWORD orientation=0;unsigned matches=0;
};
BOOL CALLBACK findMonitor(HMONITOR handle,HDC,LPRECT,LPARAM data){
  auto& target=*reinterpret_cast<Monitor*>(data);MONITORINFOEXW info{};info.cbSize=sizeof(info);
  if(GetMonitorInfoW(handle,reinterpret_cast<MONITORINFO*>(&info))&&classroom::nearRect({target.bounds.left,target.bounds.top,target.bounds.right,target.bounds.bottom},{info.rcMonitor.left,info.rcMonitor.top,info.rcMonitor.right,info.rcMonitor.bottom},target.tolerance)){
    DEVMODEW mode{};mode.dmSize=sizeof(mode);
    if(EnumDisplaySettingsExW(info.szDevice,ENUM_CURRENT_SETTINGS,&mode,0)){target.handle=handle;target.actualBounds=info.rcMonitor;target.device=info.szDevice;target.orientation=mode.dmDisplayOrientation;++target.matches;}
  }
  return TRUE;
}
bool sameMonitor(const Monitor& original){
  Monitor current;current.bounds=original.bounds;if(!EnumDisplayMonitors(nullptr,nullptr,findMonitor,reinterpret_cast<LPARAM>(&current)))return false;
  return current.matches==1&&current.handle==original.handle&&current.device==original.device&&current.orientation==original.orientation;
}
std::wstring desktopName(HDESK desktop){
  wchar_t name[256]{};DWORD required=0;
  return desktop&&GetUserObjectInformationW(desktop,UOI_NAME,name,sizeof(name),&required)?name:L"";
}
bool sameInputDesktop(const std::wstring& original){
  const auto desktop=OpenInputDesktop(0,FALSE,DESKTOP_READOBJECTS);if(!desktop)return false;
  const auto current=desktopName(desktop);CloseDesktop(desktop);return !current.empty()&&current==original;
}
bool send(INPUT input){return SendInput(1,&input,sizeof(INPUT))==1;}
INPUT keyboard(const std::string& name,bool down){
  INPUT input{};input.type=INPUT_KEYBOARD;const auto key=classroom::keys().at(name);input.ki.wScan=key.scan;
  input.ki.dwFlags=KEYEVENTF_SCANCODE|(key.extended?KEYEVENTF_EXTENDEDKEY:0)|(down?0:KEYEVENTF_KEYUP);return input;
}
DWORD buttonFlag(const std::string& name,bool down){return name=="left"?(down?MOUSEEVENTF_LEFTDOWN:MOUSEEVENTF_LEFTUP):name=="right"?(down?MOUSEEVENTF_RIGHTDOWN:MOUSEEVENTF_RIGHTUP):(down?MOUSEEVENTF_MIDDLEDOWN:MOUSEEVENTF_MIDDLEUP);}
class WindowsSink:public classroom::Sink {
  RECT bounds;
  bool move(const classroom::Event& event){
    const int left=GetSystemMetrics(SM_XVIRTUALSCREEN),top=GetSystemMetrics(SM_YVIRTUALSCREEN),width=GetSystemMetrics(SM_CXVIRTUALSCREEN),height=GetSystemMetrics(SM_CYVIRTUALSCREEN);
    if(width<2||height<2)return false;
    const auto x=classroom::pixel(event.x,bounds.left,static_cast<long long>(bounds.right)-bounds.left),y=classroom::pixel(event.y,bounds.top,static_cast<long long>(bounds.bottom)-bounds.top);
    if(x<left||y<top||x>=static_cast<long long>(left)+width||y>=static_cast<long long>(top)+height)return false;
    INPUT input{};input.type=INPUT_MOUSE;input.mi.dx=static_cast<LONG>(std::llround((x-left)*65535.0/(width-1)));input.mi.dy=static_cast<LONG>(std::llround((y-top)*65535.0/(height-1)));input.mi.dwFlags=MOUSEEVENTF_MOVE|MOUSEEVENTF_ABSOLUTE|MOUSEEVENTF_VIRTUALDESK;
    return send(input);
  }
public:
  explicit WindowsSink(RECT rect):bounds(rect){}
  bool apply(const classroom::Event& event)override{
    if(event.type=="key")return send(keyboard(event.code,event.down));
    if(!move(event))return false;
    if(event.type=="move")return true;
    if(event.type=="button"){INPUT input{};input.type=INPUT_MOUSE;input.mi.dwFlags=buttonFlag(event.button,event.down);return send(input);}
    if(event.type=="wheel"){
      const auto wheel=[](double value,DWORD flag){const auto delta=static_cast<LONG>(std::llround(value*WHEEL_DELTA/100.0));if(!delta)return true;INPUT input{};input.type=INPUT_MOUSE;input.mi.dwFlags=flag;input.mi.mouseData=static_cast<DWORD>(delta);return send(input);};
      return wheel(-event.deltaY,MOUSEEVENTF_WHEEL)&&wheel(event.deltaX,MOUSEEVENTF_HWHEEL);
    }
    return false;
  }
  void releaseKey(const std::string& code)override{send(keyboard(code,false));}
  void releaseButton(const std::string& button)override{INPUT input{};input.type=INPUT_MOUSE;input.mi.dwFlags=buttonFlag(button,false);send(input);}
};
bool integer(const char* text,long long& value){if(!text||!*text)return false;char* end=nullptr;errno=0;value=std::strtoll(text,&end,10);return !errno&&end&&!*end;}
bool nonce(const std::string& value){
  if(value.size()!=36)return false;
  for(size_t i=0;i<value.size();i++){if(i==8||i==13||i==18||i==23){if(value[i]!='-')return false;}else if(!((value[i]>='0'&&value[i]<='9')||(value[i]>='a'&&value[i]<='f')||(value[i]>='A'&&value[i]<='F')))return false;}
  return true;
}
std::wstring eventName(long long parent,const std::string& id){return L"Local\\XiangyuRemoteInput-"+std::to_wstring(parent)+L"-"+std::wstring(id.begin(),id.end());}
} // namespace

int main(int argc,char** argv){
  if(argc==2&&std::string(argv[1])=="--self-test"){const bool ok=classroom::selfTest();std::cout<<(ok?"ok":"failed")<<std::endl;return ok?0:1;}
  if(argc==4&&std::string(argv[1])=="--stop"){
    long long parentId;if(!integer(argv[2],parentId)||parentId<1||parentId>MAXDWORD||!nonce(argv[3]))return 1;
    HANDLE stop=OpenEventW(EVENT_MODIFY_STATE,FALSE,eventName(parentId,argv[3]).c_str());if(!stop)return 1;
    const bool ok=SetEvent(stop);CloseHandle(stop);return ok?0:1;
  }
  if(argc!=8||!nonce(argv[7]))return 1;
  long long x,y,width,height,parentId,tolerance;
  if(!integer(argv[1],x)||!integer(argv[2],y)||!integer(argv[3],width)||!integer(argv[4],height)||!integer(argv[5],tolerance)||!integer(argv[6],parentId)||x<LONG_MIN||y<LONG_MIN||x>LONG_MAX||y>LONG_MAX||width<1||height<1||width>LONG_MAX||height>LONG_MAX||x+width>LONG_MAX||y+height>LONG_MAX||parentId<1||parentId>MAXDWORD||tolerance<0||tolerance>16)return 1;
  // The helper is asInvoker, PerMonitorV2 and never requests elevation or UIAccess.
  // Main-process consent and server leases are required before it is launched.
  Monitor monitor;monitor.bounds={static_cast<LONG>(x),static_cast<LONG>(y),static_cast<LONG>(x+width),static_cast<LONG>(y+height)};monitor.tolerance=tolerance;
  if(!EnumDisplayMonitors(nullptr,nullptr,findMonitor,reinterpret_cast<LPARAM>(&monitor))||monitor.matches!=1)return 1;
  monitor.bounds=monitor.actualBounds;monitor.tolerance=0;
  const auto desktop=desktopName(GetThreadDesktop(GetCurrentThreadId()));
  HANDLE parent=OpenProcess(SYNCHRONIZE,FALSE,static_cast<DWORD>(parentId));
  if(!parent||desktop.empty()||!sameInputDesktop(desktop))return 1;
  SetLastError(0);HANDLE stop=CreateEventW(nullptr,TRUE,FALSE,eventName(parentId,argv[7]).c_str());
  if(!stop||GetLastError()==ERROR_ALREADY_EXISTS){if(stop)CloseHandle(stop);CloseHandle(parent);return 1;}
  SetConsoleCtrlHandler(consoleControl,TRUE);
  WindowsSink sink(monitor.bounds);classroom::InputSession session(sink,GetTickCount64());std::mutex mutex;
  const auto shutdown=[&](int status){std::lock_guard<std::mutex> lock(mutex);session.close();CloseHandle(stop);CloseHandle(parent);std::_Exit(status);};
  std::thread reader([&]{
    std::string line;char c;
    while(std::cin.get(c)){
      if(c=='\n'){
        const auto parsed=classroom::command(line);line.clear();
        std::lock_guard<std::mutex> lock(mutex);
        if(WaitForSingleObject(stop,0)!=WAIT_TIMEOUT||!sameMonitor(monitor)||!sameInputDesktop(desktop)||!session.accept(parsed,GetTickCount64())){session.close();CloseHandle(stop);CloseHandle(parent);std::_Exit(1);}
      }else{if(line.size()>=4096){shutdown(1);return;}line+=c;}
    }
    shutdown(0);
  });
  reader.detach();std::cout<<"ready"<<std::endl;
  for(;;){
    Sleep(50);
    std::lock_guard<std::mutex> lock(mutex);
    if(interrupted.load()||WaitForSingleObject(stop,0)!=WAIT_TIMEOUT||WaitForSingleObject(parent,0)!=WAIT_TIMEOUT||!session.tick(GetTickCount64(),sameMonitor(monitor)&&sameInputDesktop(desktop))){session.close();CloseHandle(stop);CloseHandle(parent);std::_Exit(1);}
  }
}
#else
int main(){const bool ok=classroom::selfTest();std::cout<<(ok?"ok":"failed")<<std::endl;return ok?0:1;}
#endif
