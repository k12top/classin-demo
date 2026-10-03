import { ClassroomEnvironment } from '../common/ClassroomEnvironment';

@Entry
@Component
struct Index {
  @State private inspectorOpen: boolean = false;
  @State private selectedTool: string = '课堂';

  build() {
    Column() {
      Row() {
        Column() {
          Text('LIVE CLASS')
            .fontSize(10)
            .fontColor('#A7AFBD')
            .letterSpacing(1.6)
          Text('翔宇文淑课堂')
            .fontSize(20)
            .fontWeight(FontWeight.Bold)
            .fontColor('#F4F6F8')
        }
        Blank()
        Text('已连接')
          .fontSize(12)
          .fontColor('#32D49A')
          .padding({ left: 10, right: 10, top: 6, bottom: 6 })
          .borderRadius(18)
          .backgroundColor('#18372B')
      }
      .width('100%')
      .padding({ left: 20, right: 20, top: 16, bottom: 14 })

      Row() {
        Column() {
          Text('教学舞台')
            .fontSize(12)
            .fontColor('#A7AFBD')
          Text('媒体、白板或课件将始终在这里显示')
            .fontSize(16)
            .fontColor('#F4F6F8')
            .margin({ top: 10 })
          Text('HarmonyOS NEXT 将通过服务端 bootstrap 获取临时 RTC 凭证。')
            .fontSize(12)
            .fontColor('#A7AFBD')
            .margin({ top: 8 })
        }
        .alignItems(HorizontalAlign.Start)
        .justifyContent(FlexAlign.Center)
        .layoutWeight(1)
        .height('100%')
        .padding(24)
        .borderRadius(22)
        .backgroundColor('#15171C')

        if (this.inspectorOpen) {
          Column() {
            Text('课堂检查器')
              .fontSize(18)
              .fontWeight(FontWeight.Bold)
              .fontColor('#F4F6F8')
            Text('成员 · 聊天 · 字幕 · 课件')
              .fontSize(14)
              .fontColor('#A7AFBD')
              .margin({ top: 12 })
          }
          .width(260)
          .height('100%')
          .padding(20)
          .margin({ left: 12 })
          .borderRadius(18)
          .backgroundColor('#15171C')
        }
      }
      .layoutWeight(1)
      .width('100%')
      .padding(12)

      Row() {
        Button('麦克风').type(ButtonType.Normal).onClick(() => this.selectedTool = '麦克风')
        Button('摄像头').type(ButtonType.Normal).margin({ left: 8 }).onClick(() => this.selectedTool = '摄像头')
        Button('课件').type(ButtonType.Normal).margin({ left: 8 }).onClick(() => this.selectedTool = '课件')
        Button(this.inspectorOpen ? '收起面板' : '打开面板')
          .type(ButtonType.Normal)
          .margin({ left: 8 })
          .onClick(() => this.inspectorOpen = !this.inspectorOpen)
        Blank()
        Text(this.selectedTool)
          .fontSize(12)
          .fontColor('#A7AFBD')
      }
      .width('100%')
      .padding(16)
      .backgroundColor('#090A0D')
    }
    .height('100%')
    .width('100%')
    .backgroundColor('#090A0D')
    .onAppear(() => console.info(`Classroom API: ${ClassroomEnvironment.apiBaseUrl}`))
  }
}
