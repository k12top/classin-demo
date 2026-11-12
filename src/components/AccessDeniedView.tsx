"use client";

import Link from "next/link";
import { type CourseAccessDeniedCode } from "@/lib/access-denied-codes";
import { ArrowLeft, ArrowRight, Clock, Lock, Search, XCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import styles from "./access-denied.module.css";

// This page is reached outside the authenticated application shell, so it keeps
// its error-state copy local. Every selectable interface locale must have a
// native version here rather than silently dropping to English.
const LOCALIZED_DENIED_TEXT: Record<string, Record<string, string>> = {
  "zh-CN": {
    accessDenied: "访问受限",
    viewList: "返回课程列表",
    viewDetail: "查看课程详情",
    notEnrolledTitle: "暂无访问权限",
    notEnrolledDesc: "您未被分配到此课程",
    notEnrolledHint: "请联系授课老师将您加入课程，或使用老师提供的分享链接。",
    courseFinishedTitle: "课程已结束",
    courseFinishedDesc: "本节课已结束，无法进入课堂",
    courseFinishedHint: "如需复习或回放，请稍后在「已结束」列表中查看。",
    notStartedTitle: "课程还未开启",
    notStartedDesc: "课程还未开启，可以在课前1小时进入",
    notStartedHint: "请稍后再进入课堂。",
    courseCancelledTitle: "课程已取消",
    courseCancelledDesc: "本节课已取消",
    courseCancelledHint: "如有疑问，请联系授课老师确认安排。",
    notFoundTitle: "课程不存在",
    notFoundDesc: "链接无效或课程已删除",
    notFoundHint: "请确认链接是否正确，或返回首页重新选择课程。",
    defaultTitle: "无法进入课堂",
    defaultDesc: "暂时无法访问此课程",
    defaultHint: "如果您认为这是一个错误，请联系课程老师。",
  },
  en: {
    accessDenied: "Access Restricted",
    viewList: "Back to Course List",
    viewDetail: "View Course Details",
    notEnrolledTitle: "Access Denied",
    notEnrolledDesc: "You are not assigned to this course",
    notEnrolledHint: "Please contact your teacher to add you, or use the share link provided.",
    courseFinishedTitle: "Course Finished",
    courseFinishedDesc: "This class has finished, unable to enter",
    courseFinishedHint: "If you need to review, please check under 'Finished' tab later.",
    notStartedTitle: "Course Not Open Yet",
    notStartedDesc: "This course is not open yet. You can enter 1 hour before class.",
    notStartedHint: "Please come back closer to the scheduled start time.",
    courseCancelledTitle: "Course Cancelled",
    courseCancelledDesc: "This class has been cancelled",
    courseCancelledHint: "If you have questions, please contact the course instructor.",
    notFoundTitle: "Course Not Found",
    notFoundDesc: "Invalid link or course has been deleted",
    notFoundHint: "Please verify the link, or return to home page to select a course.",
    defaultTitle: "Cannot Enter Classroom",
    defaultDesc: "Temporarily unable to access this course",
    defaultHint: "If you believe this is an error, please contact your instructor.",
  },
  "zh-TW": {
    accessDenied: "存取受限",
    viewList: "返回課程列表",
    viewDetail: "查看課程詳情",
    notEnrolledTitle: "尚無存取權限",
    notEnrolledDesc: "您尚未被加入此課程",
    notEnrolledHint: "請聯絡授課老師將您加入課程，或使用老師提供的分享連結。",
    courseFinishedTitle: "課程已結束",
    courseFinishedDesc: "本節課已結束，無法進入教室",
    courseFinishedHint: "如需複習或查看回放，請稍後到「已結束」列表查看。",
    courseCancelledTitle: "課程已取消",
    courseCancelledDesc: "本節課已取消",
    courseCancelledHint: "如有疑問，請聯絡授課老師確認安排。",
    notFoundTitle: "找不到課程",
    notFoundDesc: "連結無效或課程已刪除",
    notFoundHint: "請確認連結是否正確，或返回首頁重新選擇課程。",
    defaultTitle: "無法進入教室",
    defaultDesc: "暫時無法存取此課程",
    defaultHint: "若您認為這是錯誤，請聯絡授課老師。",
  },
  es: {
    accessDenied: "Acceso restringido",
    viewList: "Volver a cursos",
    viewDetail: "Ver detalles del curso",
    notEnrolledTitle: "Sin acceso",
    notEnrolledDesc: "No estás asignado a este curso",
    notEnrolledHint: "Pide a tu docente que te añada al curso o usa el enlace compartido.",
    courseFinishedTitle: "Curso finalizado",
    courseFinishedDesc: "Esta clase ha terminado y no se puede acceder",
    courseFinishedHint: "Para repasar o ver la grabación, consulta más tarde la lista de finalizados.",
    courseCancelledTitle: "Curso cancelado",
    courseCancelledDesc: "Esta clase fue cancelada",
    courseCancelledHint: "Si tienes dudas, confirma la programación con el docente.",
    notFoundTitle: "Curso no encontrado",
    notFoundDesc: "El enlace no es válido o el curso fue eliminado",
    notFoundHint: "Comprueba el enlace o vuelve al inicio para elegir un curso.",
    defaultTitle: "No se puede entrar al aula",
    defaultDesc: "No es posible acceder a este curso por el momento",
    defaultHint: "Si crees que es un error, contacta con tu docente.",
  },
  pt: {
    accessDenied: "Acesso restrito",
    viewList: "Voltar aos cursos",
    viewDetail: "Ver detalhes do curso",
    notEnrolledTitle: "Sem permissão de acesso",
    notEnrolledDesc: "Você não está inscrito neste curso",
    notEnrolledHint: "Peça ao professor para adicioná-lo ao curso ou use o link compartilhado.",
    courseFinishedTitle: "Curso encerrado",
    courseFinishedDesc: "Esta aula foi encerrada e não pode ser acessada",
    courseFinishedHint: "Para revisar ou ver a gravação, consulte mais tarde a lista de encerrados.",
    courseCancelledTitle: "Curso cancelado",
    courseCancelledDesc: "Esta aula foi cancelada",
    courseCancelledHint: "Em caso de dúvidas, confirme o horário com o professor.",
    notFoundTitle: "Curso não encontrado",
    notFoundDesc: "O link é inválido ou o curso foi excluído",
    notFoundHint: "Confira o link ou volte ao início para escolher um curso.",
    defaultTitle: "Não foi possível entrar na sala",
    defaultDesc: "Não foi possível acessar este curso no momento",
    defaultHint: "Se achar que se trata de um erro, entre em contato com o professor.",
  },
  de: {
    accessDenied: "Zugriff eingeschränkt",
    viewList: "Zurück zu Kursen",
    viewDetail: "Kursdetails anzeigen",
    notEnrolledTitle: "Kein Zugriff",
    notEnrolledDesc: "Sie sind diesem Kurs nicht zugeordnet",
    notEnrolledHint: "Bitten Sie Ihre Lehrkraft, Sie hinzuzufügen, oder verwenden Sie den bereitgestellten Freigabelink.",
    courseFinishedTitle: "Kurs beendet",
    courseFinishedDesc: "Diese Unterrichtsstunde ist beendet und kann nicht betreten werden",
    courseFinishedHint: "Zum Wiederholen oder für die Aufzeichnung sehen Sie später in der Liste „Beendet“ nach.",
    courseCancelledTitle: "Kurs abgesagt",
    courseCancelledDesc: "Diese Unterrichtsstunde wurde abgesagt",
    courseCancelledHint: "Bei Fragen bestätigen Sie den Termin bitte mit der Lehrkraft.",
    notFoundTitle: "Kurs nicht gefunden",
    notFoundDesc: "Der Link ist ungültig oder der Kurs wurde gelöscht",
    notFoundHint: "Prüfen Sie den Link oder kehren Sie zur Startseite zurück, um einen Kurs auszuwählen.",
    defaultTitle: "Betreten des Klassenraums nicht möglich",
    defaultDesc: "Auf diesen Kurs kann derzeit nicht zugegriffen werden",
    defaultHint: "Wenn Sie glauben, dass dies ein Fehler ist, wenden Sie sich an Ihre Lehrkraft.",
  },
  it: {
    accessDenied: "Accesso limitato",
    viewList: "Torna ai corsi",
    viewDetail: "Visualizza dettagli del corso",
    notEnrolledTitle: "Nessun accesso",
    notEnrolledDesc: "Non sei assegnato a questo corso",
    notEnrolledHint: "Chiedi al docente di aggiungerti al corso o usa il link condiviso.",
    courseFinishedTitle: "Corso terminato",
    courseFinishedDesc: "Questa lezione è terminata e non è possibile entrare",
    courseFinishedHint: "Per ripassare o vedere la registrazione, controlla più tardi l’elenco dei corsi terminati.",
    courseCancelledTitle: "Corso annullato",
    courseCancelledDesc: "Questa lezione è stata annullata",
    courseCancelledHint: "In caso di dubbi, conferma l’orario con il docente.",
    notFoundTitle: "Corso non trovato",
    notFoundDesc: "Il link non è valido o il corso è stato eliminato",
    notFoundHint: "Verifica il link o torna alla home per scegliere un corso.",
    defaultTitle: "Impossibile entrare in aula",
    defaultDesc: "Al momento non è possibile accedere a questo corso",
    defaultHint: "Se pensi che sia un errore, contatta il docente.",
  },
  ar: {
    accessDenied: "الوصول مقيّد",
    viewList: "العودة إلى المقررات",
    viewDetail: "عرض تفاصيل المقرر",
    notEnrolledTitle: "لا توجد صلاحية وصول",
    notEnrolledDesc: "أنت غير مسجّل في هذا المقرر",
    notEnrolledHint: "يرجى التواصل مع المعلّم لإضافتك إلى المقرر أو استخدام رابط المشاركة المرسل إليك.",
    courseFinishedTitle: "انتهى المقرر",
    courseFinishedDesc: "انتهى هذا الدرس ولا يمكن الدخول إلى الفصل",
    courseFinishedHint: "للمراجعة أو مشاهدة التسجيل، راجع قائمة الدروس المنتهية لاحقًا.",
    courseCancelledTitle: "أُلغي المقرر",
    courseCancelledDesc: "أُلغي هذا الدرس",
    courseCancelledHint: "إذا كان لديك سؤال، يرجى تأكيد الموعد مع المعلّم.",
    notFoundTitle: "المقرر غير موجود",
    notFoundDesc: "الرابط غير صالح أو تم حذف المقرر",
    notFoundHint: "تحقق من الرابط أو عد إلى الصفحة الرئيسية لاختيار مقرر.",
    defaultTitle: "لا يمكن الدخول إلى الفصل",
    defaultDesc: "يتعذر الوصول إلى هذا المقرر مؤقتًا",
    defaultHint: "إذا كنت تعتقد أن هذا خطأ، فتواصل مع المعلّم.",
  },
  hi: {
    accessDenied: "पहुंच प्रतिबंधित",
    viewList: "पाठ्यक्रम सूची पर वापस",
    viewDetail: "पाठ्यक्रम विवरण देखें",
    notEnrolledTitle: "पहुंच उपलब्ध नहीं",
    notEnrolledDesc: "आपको इस पाठ्यक्रम में नहीं जोड़ा गया है",
    notEnrolledHint: "कृपया शिक्षक से आपको जोड़ने के लिए कहें या साझा किया गया लिंक उपयोग करें।",
    courseFinishedTitle: "पाठ्यक्रम समाप्त",
    courseFinishedDesc: "यह कक्षा समाप्त हो चुकी है और इसमें प्रवेश नहीं किया जा सकता",
    courseFinishedHint: "दोहराने या रिकॉर्डिंग देखने के लिए बाद में समाप्त कक्षाओं की सूची देखें।",
    courseCancelledTitle: "पाठ्यक्रम रद्द",
    courseCancelledDesc: "यह कक्षा रद्द कर दी गई है",
    courseCancelledHint: "किसी प्रश्न के लिए शिक्षक से समय-सारणी की पुष्टि करें।",
    notFoundTitle: "पाठ्यक्रम नहीं मिला",
    notFoundDesc: "लिंक अमान्य है या पाठ्यक्रम हटा दिया गया है",
    notFoundHint: "लिंक जाँचें या पाठ्यक्रम चुनने के लिए होम पेज पर लौटें।",
    defaultTitle: "कक्षा में प्रवेश नहीं हो सकता",
    defaultDesc: "इस समय इस पाठ्यक्रम तक पहुंच संभव नहीं है",
    defaultHint: "यदि आपको लगता है कि यह त्रुटि है, तो शिक्षक से संपर्क करें।",
  },
  ja: {
    accessDenied: "アクセス制限",
    viewList: "授業一覧に戻る",
    viewDetail: "授業詳細を表示",
    notEnrolledTitle: "アクセス権限なし",
    notEnrolledDesc: "この授業に割り当てられていません",
    notEnrolledHint: "先生に連絡して授業に追加してもらうか、共有リンクを使用してください。",
    courseFinishedTitle: "授業終了",
    courseFinishedDesc: "この授業は終了したため、入室できません",
    courseFinishedHint: "復習や録画が必要な場合は、後で「終了済み」リストから確認してください。",
    courseCancelledTitle: "授業キャンセル",
    courseCancelledDesc: "この授業はキャンセルされました",
    courseCancelledHint: "ご不明な点がある場合は、先生に直接ご確認ください。",
    notFoundTitle: "授業が見つかりません",
    notFoundDesc: "無効なリンクか、授業が削除されました",
    notFoundHint: "リンクが正しいか確認するか、ホームに戻って授業を選択し直してください。",
    defaultTitle: "入室できません",
    defaultDesc: "一時的にこの授業にアクセスできません",
    defaultHint: "これがエラーだと思われる場合は、先生までご連絡ください。",
  },
  fr: {
    accessDenied: "Accès Restreint",
    viewList: "Retour à la liste",
    viewDetail: "Détails du cours",
    notEnrolledTitle: "Accès Refusé",
    notEnrolledDesc: "Vous n'êtes pas assigné à ce cours",
    notEnrolledHint: "Veuillez contacter votre enseignant pour vous ajouter au cours.",
    courseFinishedTitle: "Cours Terminé",
    courseFinishedDesc: "Ce cours est terminé, impossible d'entrer",
    courseFinishedHint: "Si vous devez réviser, vérifiez l'onglet 'Terminés' plus tard.",
    courseCancelledTitle: "Cours Annulé",
    courseCancelledDesc: "Ce cours a été annulé",
    courseCancelledHint: "Veuillez contacter votre enseignant pour confirmer l'organisation.",
    notFoundTitle: "Cours Non Trouvé",
    notFoundDesc: "Lien invalide ou cours supprimé",
    notFoundHint: "Vérifiez le lien ou retournez à l'accueil pour choisir un autre cours.",
    defaultTitle: "Entrée Impossible",
    defaultDesc: "Accès temporairement indisponible pour ce cours",
    defaultHint: "Si vous pensez qu'il s'agit d'une erreur, contactez l'enseignant.",
  },
  ru: {
    accessDenied: "Доступ ограничен",
    viewList: "Вернуться к списку",
    viewDetail: "Детали курса",
    notEnrolledTitle: "Доступ запрещен",
    notEnrolledDesc: "Вы не добавлены в этот урок",
    notEnrolledHint: "Пожалуйста, свяжитесь с учителем, чтобы он добавил вас на урок.",
    courseFinishedTitle: "Урок завершен",
    courseFinishedDesc: "Этот урок завершен, вход невозможен",
    courseFinishedHint: "Запись урока будет доступна позже во вкладке «Завершенные».",
    courseCancelledTitle: "Урок отменен",
    courseCancelledDesc: "Этот урок был отменен",
    courseCancelledHint: "При возникновении вопросов свяжитесь с преподавателем.",
    notFoundTitle: "Урок не найден",
    notFoundDesc: "Недействительная ссылка или урок удален",
    notFoundHint: "Проверьте ссылку или вернитесь на главную для выбора другого урока.",
    defaultTitle: "Вход невозможен",
    defaultDesc: "Временные проблемы с доступом к уроку",
    defaultHint: "Если вы считаете, что это ошибка, обратитесь к учителю.",
  },
  th: {
    accessDenied: "การเข้าถึงถูกจำกัด",
    viewList: "กลับไปยังรายการ",
    viewDetail: "ดูรายละเอียดหลักสูตร",
    notEnrolledTitle: "ไม่มีสิทธิ์เข้าถึง",
    notEnrolledDesc: "คุณไม่ได้รับมอบหมายให้เข้าชั้นเรียนนี้",
    notEnrolledHint: "โปรดติดต่ออาจารย์เพื่อเพิ่มคุณเข้าชั้นเรียน หรือใช้ลิงก์เชิญที่ได้รับ",
    courseFinishedTitle: "ชั้นเรียนเสร็จสิ้นแล้ว",
    courseFinishedDesc: "ชั้นเรียนนี้เสร็จสิ้นแล้ว ไม่สามารถเข้าห้องเรียนได้",
    courseFinishedHint: "หากต้องการทบทวน โปรดตรวจสอบที่แท็บ 'เสร็จสิ้นแล้ว' ภายหลัง",
    courseCancelledTitle: "ชั้นเรียนยกเลิกแล้ว",
    courseCancelledDesc: "ชั้นเรียนนี้ถูกยกเลิกแล้ว",
    courseCancelledHint: "หากมีข้อสงสัย โปรดติดต่ออาจารย์เพื่อยืนยันตารางเรียน",
    notFoundTitle: "ไม่พบชั้นเรียน",
    notFoundDesc: "ลิงก์ไม่ถูกต้องหรือชั้นเรียนถูกลบแล้ว",
    notFoundHint: "โปรดตรวจสอบลิงก์ให้ถูกต้อง หรือกลับหน้าหลักเพื่อเลือกชั้นเรียนใหม่",
    defaultTitle: "เข้าห้องเรียนไม่ได้",
    defaultDesc: "ไม่สามารถเข้าถึงชั้นเรียนนี้ได้ในขณะนี้",
    defaultHint: "หากคุณคิดว่าเป็นข้อผิดพลาด โปรดติดต่ออาจารย์ผู้สอน",
  },
  vi: {
    accessDenied: "Truy cập bị hạn chế",
    viewList: "Quay lại danh sách",
    viewDetail: "Xem chi tiết khóa học",
    notEnrolledTitle: "Không có quyền truy cập",
    notEnrolledDesc: "Bạn chưa được xếp vào khóa học này",
    notEnrolledHint: "Vui lòng liên hệ giáo viên để thêm bạn vào lớp, hoặc dùng liên kết chia sẻ.",
    courseFinishedTitle: "Khóa học đã kết thúc",
    courseFinishedDesc: "Bài học đã kết thúc, không thể vào phòng học",
    courseFinishedHint: "Để ôn tập hoặc xem lại, vui lòng kiểm tra danh sách 'Đã kết thúc' sau.",
    courseCancelledTitle: "Khóa học đã hủy",
    courseCancelledDesc: "Khóa học này đã bị hủy",
    courseCancelledHint: "Nếu có thắc mắc, vui lòng liên hệ giáo viên để xác nhận lại lịch.",
    notFoundTitle: "Khóa học không tồn tại",
    notFoundDesc: "Liên kết không hợp lệ hoặc khóa học đã bị xóa",
    notFoundHint: "Vui lòng xác nhận liên kết, hoặc về trang chủ để chọn lại khóa học.",
    defaultTitle: "Không thể vào phòng học",
    defaultDesc: "Tạm thời không thể truy cập khóa học này",
    defaultHint: "Nếu bạn nghĩ đây là lỗi, vui lòng liên hệ với giáo viên.",
  },
  id: {
    accessDenied: "Akses Dibatasi",
    viewList: "Kembali ke Daftar",
    viewDetail: "Lihat Detail Kelas",
    notEnrolledTitle: "Akses Ditolak",
    notEnrolledDesc: "Anda tidak ditugaskan ke kelas ini",
    notEnrolledHint: "Silakan hubungi guru Anda untuk menambahkan Anda, atau gunakan tautan bagikan.",
    courseFinishedTitle: "Kelas Selesai",
    courseFinishedDesc: "Kelas ini telah selesai, tidak dapat masuk",
    courseFinishedHint: "Jika ingin meninjau, silakan periksa di tab 'Selesai' nanti.",
    courseCancelledTitle: "Kelas Dibatalkan",
    courseCancelledDesc: "Kelas ini telah dibatalkan",
    courseCancelledHint: "Jika ada pertanyaan, silakan hubungi pengajar kelas.",
    notFoundTitle: "Kelas Tidak Ditemukan",
    notFoundDesc: "Tautan tidak valid atau kelas telah dihapus",
    notFoundHint: "Silakan periksa kembali tautan, atau kembali ke beranda untuk memilih kelas.",
    defaultTitle: "Tidak Dapat Masuk Kelas",
    defaultDesc: "Untuk sementara waktu tidak dapat mengakses kelas ini",
    defaultHint: "Jika Anda rasa ini adalah kesalahan, hubungi guru pengajar.",
  },
  ms: {
    accessDenied: "Akses Terhad",
    viewList: "Kembali ke Senarai",
    viewDetail: "Lihat Butiran Kelas",
    notEnrolledTitle: "Akses Ditolak",
    notEnrolledDesc: "Anda tidak diperuntukkan ke kelas ini",
    notEnrolledHint: "Sila hubungi guru anda untuk menambah anda, atau gunakan pautan kongsi.",
    courseFinishedTitle: "Kelas Selesai",
    courseFinishedDesc: "Kelas ini telah selesai, tidak dapat masuk",
    courseFinishedHint: "Jika ingin menyemak, sila periksa di tab 'Selesai' nanti.",
    courseCancelledTitle: "Kelas Dibatalkan",
    courseCancelledDesc: "Kelas ini telah dibatalkan",
    courseCancelledHint: "Jika ada pertanyaan, sila hubungi pengajar kelas.",
    notFoundTitle: "Kelas Tidak Ditemui",
    notFoundDesc: "Pautan tidak sah atau kelas telah dipadam",
    notFoundHint: "Sila periksa kembali pautan, atau kembali ke laman utama untuk memilih kelas.",
    defaultTitle: "Tidak Dapat Masuk Kelas",
    defaultDesc: "Buat sementara waktu tidak dapat mengakses kelas ini",
    defaultHint: "Jika anda rasa ini adalah ralat, hubungi guru pengajar.",
  },
  fil: {
    accessDenied: "Limitadong Pag-access",
    viewList: "Bumalik sa Listahan",
    viewDetail: "Tingnan ang mga Detalye ng Kurso",
    notEnrolledTitle: "Access Denied",
    notEnrolledDesc: "Hindi ka nakatalaga sa kursong ito",
    notEnrolledHint: "Mangyaring makipag-ugnayan sa iyong guro para idagdag ka, o gamitin ang share link.",
    courseFinishedTitle: "Tapos na ang Kurso",
    courseFinishedDesc: "Tapos na ang klaseng ito, hindi na makapasok",
    courseFinishedHint: "Kung kailangan mong magrepaso, pakitingnan sa tab na 'Tapos na' mamaya.",
    courseCancelledTitle: "Kanselado ang Kurso",
    courseCancelledDesc: "Ang klaseng ito ay kanselado na",
    courseCancelledHint: "Mangyaring makipag-ugnayan sa iyong tagapagturo kung may katanungan.",
    notFoundTitle: "Hindi Nahanap ang Kurso",
    notFoundDesc: "Invalid na link o nabura na ang kurso",
    notFoundHint: "Pakisuri ang link, o bumalik sa home page para pumili ng kurso.",
    defaultTitle: "Hindi Makapasok sa Classroom",
    defaultDesc: "Pansamantalang hindi ma-access ang kursong ito",
    defaultHint: "Kung sa tingin mo ay may pagkakamali, makipag-ugnayan sa iyong guro.",
  },
  ko: {
    accessDenied: "접근 제한됨",
    viewList: "강의 목록으로 돌아가기",
    viewDetail: "강의 상세 정보 보기",
    notEnrolledTitle: "접근 권한 없음",
    notEnrolledDesc: "이 강의에 배정되지 않았습니다",
    notEnrolledHint: "강사에게 연락하여 수강생으로 등록해 달라고 요청하거나 공유 링크를 사용하세요.",
    courseFinishedTitle: "강의 종료됨",
    courseFinishedDesc: "이 수업은 종료되어 입장할 수 없습니다",
    courseFinishedHint: "복습이나 다시 보기가 필요하시면 나중에 '종료됨' 탭에서 확인하세요.",
    courseCancelledTitle: "강의 취소됨",
    courseCancelledDesc: "이 수업은 취소되었습니다",
    courseCancelledHint: "문의 사항이 있으시면 강사에게 확인해 주시기 바랍니다.",
    notFoundTitle: "강의를 찾을 수 없음",
    notFoundDesc: "유효하지 않은 링크이거나 삭제된 강의입니다",
    notFoundHint: "링크가 올바른지 확인하거나 홈으로 이동하여 강의를 다시 선택하세요.",
    defaultTitle: "강의실 입장 불가",
    defaultDesc: "일시적으로 이 강의에 접근할 수 없습니다",
    defaultHint: "오류라고 생각되시면 강사에게 문의해 주세요.",
  },
  lo: {
    accessDenied: "ຈຳກັດການເຂົ້າເຖິງ",
    viewList: "ກັບຄືນໄປຫາລາຍການວິຊา",
    viewDetail: "ເບິ່ງລាយລະອຽດວິຊາ",
    notEnrolledTitle: "ບໍ່ມີສິດເຂົ້າເຖິງ",
    notEnrolledDesc: "ທ່ານບໍ່ໄດ້ຖືກມອບໝາຍໃຫ້ເຂົ້າຮຽນວິຊານີ້",
    notEnrolledHint: "ກະລຸນາຕິດຕໍ່ອາຈານເພື່ອເພີ່ມທ່ານເຂົ້າໃນວິຊາ, ຫຼືໃຊ້ລິ້ງແບ່ງປັນທີ່ໃຫ້ມາ.",
    courseFinishedTitle: "ວິຊາຮຽນຈົບແລ້ວ",
    courseFinishedDesc: "ຫ້ອງຮຽນນີ້ໄດ້ຈົບລົງແລ້ວ, ບໍ່ສາມາດເຂົ້າໄດ້",
    courseFinishedHint: "ຫາກຕ້ອງການທົບທวน, ກະລຸນາກວດເບິ່ງທີ່ແຖບ 'ສຳເລັດແລ້ວ' ພາຍຫຼັງ.",
    courseCancelledTitle: "ວິຊາຮຽນຖືກຍົກເລີກ",
    courseCancelledDesc: "ຫ້ອງຮຽນນີ້ຖືກຍົກເລີກແລ้ວ",
    courseCancelledHint: "ຫາກມີຂໍ້ສົງໄສ, ກະລຸນາຕິດຕໍ່ອາຈານເພື່ອຢືນຢັນການຈັດການຮຽນ.",
    notFoundTitle: "ບໍ່ພົບວິຊາຮຽນ",
    notFoundDesc: "ລິ້ງບໍ່ຖືກຕ້ອງ ຫຼື ວິຊາຮຽນຖືກລຶບແລ້ວ",
    notFoundHint: "ກະລຸນາກວດສອບລິ້ງ, ຫຼືກັບຄືນໄປໜ້າຫຼັກເພື່ອເລືອກວິຊາຮຽນໃໝ່.",
    defaultTitle: "ບໍ່ສາມາດເຂົ້າຫ້ອງຮຽນໄດ້",
    defaultDesc: "ບໍ່ສາມາດເຂົ້າເຖິງວິຊານີ້ໄດ້ຊົ່ວຄາວ",
    defaultHint: "ຫາກທ່ານຄິດວ່າມີຂໍ້ຜິດພາດ, ກະລຸນາຕິດຕໍ່ອາຈານຜູ້ສອນ.",
  },
  my: {
    accessDenied: "ဝင်ရောက်ခွင့် ကန့်သတ်ထားသည်",
    viewList: "သင်တန်းစာရင်းသို့ ပြန်သွားရန်",
    viewDetail: "သင်တန်းအသေးစိတ်ကို ကြည့်ရန်",
    notEnrolledTitle: "ဝင်ရောက်ခွင့်မရှိပါ",
    notEnrolledDesc: "သင်သည် ဤသင်တန်းတွင် ပါဝင်ခွင့်မရှိပါ",
    notEnrolledHint: "သင့်အား သင်တန်းထဲသို့ ထည့်သွင်းပေးရန် ဆရာအား ဆက်သွယ်ပါ သို့မဟုတ် ပေးထားသော မျှဝေခြင်းလင့်ခ်ကို သုံးပါ။",
    courseFinishedTitle: "သင်တန်းပြီးဆုံးပါပြီ",
    courseFinishedDesc: "ဤသင်တန်း ပြီးဆုံးသွားပြီဖြစ်၍ ဝင်ရောက်၍မရပါ",
    courseFinishedHint: "ပြန်လည်လေ့လာလိုပါက နောက်ပိုင်းတွင် 'ပြီးဆုံးပြီး' တက်ဘ်တွင် စစ်ဆေးပါ။",
    courseCancelledTitle: "သင်တန်းပယ်ဖျက်လိုက်သည်",
    courseCancelledDesc: "ဤအတန်းအား ပယ်ဖျက်လိုက်ပါသည်",
    courseCancelledHint: "မေးခွန်းများရှိပါက သင်တန်းဆရာအား ဆက်သွယ်စုံစမ်းပါ။",
    notFoundTitle: "သင်တန်းရှာမတွေ့ပါ",
    notFoundDesc: "လင့်ခ် မမှန်ကန်ပါ သို့မဟုတ် သင်တန်းကို ဖျက်လိုက်ပါပြီ",
    notFoundHint: "လင့်ခ်ကို စစ်ဆေးပါ သို့မဟုတ် သင်တန်းအသစ်ရွေးရန် ပင်မစာမျက်နှာသို့ ပြန်သွားပါ။",
    defaultTitle: "စာသင်ခန်းသို့ ဝင်၍မရပါ",
    defaultDesc: "ဤသင်တန်းသို့ ယာယီဝင်ရောက်၍မရနိုင်ပါ",
    defaultHint: "မှားယွင်းနေသည်ဟု ယူဆပါက သင်တန်းဆရာအား ဆက်သွယ်ပါ။",
  },
  km: {
    accessDenied: "ការចូលប្រើត្រូវបានកန့်សត",
    viewList: "ត្រឡប់ទៅបញ្ជីរាយនាម",
    viewDetail: "មើលព័ត៌មានលម្អិតវគ្គសិក្សា",
    notEnrolledTitle: "គ្មានសិទ្ធិចូលប្រើប្រាស់",
    notEnrolledDesc: "អ្នកមិនត្រូវបានចាត់តាំងឱ្យចូលរួមវគ្គសិក្សានេះទេ",
    notEnrolledHint: "សូមទាក់ទងគ្រូរបស់អ្នកដើម្បីបន្ថែមអ្នក ឬប្រើប្រាស់តំណភ្ជាប់ដែលបានផ្តល់ជូន។",
    courseFinishedTitle: "វគ្គសិក្សាត្រូវបានបញ្ចប់",
    courseFinishedDesc: "ថ្នាក់សិក្សានេះត្រូវបានបញ្ចប់ មិនអាចចូលបានទេ",
    courseFinishedHint: "ប្រសិនបើ...អ្នកត្រូវការរំលឹកមេរៀន សូមពិនិត្យមើលផ្ទាំង 'បានបញ្ចប់' នៅពេលក្រោយ។",
    courseCancelledTitle: "វគ្គសិក្សាត្រូវបានលុបចោល",
    courseCancelledDesc: "ថ្នាក់សិក្សានេះត្រូវបានលុបចោលហើយ",
    courseCancelledHint: "ប្រសិនបើមានចម្ងល់ សូមទាក់ទងគ្រូបង្គោលដើម្បីបញ្ជាក់ពីការរៀបចំឡើងវិញ។",
    notFoundTitle: "រកមិនឃើញវគ្គសិក្សា",
    notFoundDesc: "តំណភ្ជាប់មិនត្រឹមត្រូវ ឬវគ្គសិក្សាត្រូវបានលុបចោល",
    notFoundHint: "សូមផ្ទៀងផ្ទាត់តំណភ្ជាប់ ឬត្រឡប់ទៅទំព័រដើមវិញដើម្បីជ្រើសរើសវគ្គសិក្សាថ្មី។",
    defaultTitle: "មិនអាចចូលថ្នាក់រៀនបានទេ",
    defaultDesc: "មិនអាចចូលប្រើវគ្គសិក្សានេះជាបណ្តោះអាសន្នបានទេ",
    defaultHint: "ប្រសិនបើអ្នកគិតថានេះជាកំហុស សូមទាក់ទងទៅគ្រូរបស់អ្នក។",
  },
  ta: {
    accessDenied: "அனுமதி வரம்பிற்குட்பட்டது",
    viewList: "வகுப்புப் பட்டியலுக்குத் திரும்பு",
    viewDetail: "வகுப்பு விவரங்களைக் காண்க",
    notEnrolledTitle: "அனுமதி மறுக்கப்பட்டது",
    notEnrolledDesc: "நீங்கள் இந்த வகுப்பில் சேர்க்கப்படவில்லை",
    notEnrolledHint: "உங்களைச் சேர்க்க ஆசிரியரைத் தொடர்பு கொள்ளவும், அல்லது பகிரப்பட்ட இணைப்பைப் பயன்படுத்தவும்.",
    courseFinishedTitle: "வகுப்பு முடிவடைந்தது",
    courseFinishedDesc: "இந்த வகுப்பு முடிந்துவிட்டது, நுழைய முடியாது",
    courseFinishedHint: "மீளாய்வு செய்ய வேண்டுமெனில், பின்னர் 'முடிவடைந்தவை' தாவலில் சரிபார்க்கவும்.",
    courseCancelledTitle: "வகுப்பு ரத்து செய்யப்பட்டது",
    courseCancelledDesc: "இந்த வகுப்பு ரத்து செய்யப்பட்டுள்ளது",
    courseCancelledHint: "ஏதேனும் சந்தேகங்கள் இருந்தால், ஆசிரியரைத் தொடர்பு கொள்ளவும்.",
    notFoundTitle: "வகுப்பு கண்டறியப்படவில்லை",
    notFoundDesc: "தவறான இணைப்பு அல்லது வகுப்பு நீக்கப்பட்டுவிட்டது",
    notFoundHint: "இணைப்பைச் சரிபார்க்கவும், அல்லது புதிய வகுப்பைத் தேர்ந்தெடுக்க முகப்புப் பக்கத்திற்குச் செல்லவும்.",
    defaultTitle: "வகுப்பறைக்குள் நுழைய முடியாது",
    defaultDesc: "இந்த வகுப்பைத் தற்காலிகமாக அணுக முடியாது",
    defaultHint: "இது பிழை என்று நீங்கள் நினைத்தால், உங்கள் ஆசிரியரைத் தொடர்பு கொள்ளவும்.",
  },
  sw: {
    accessDenied: "Ufikiaji Umezuiliwa",
    viewList: "Rudi kwenye Orodha ya Kozi",
    viewDetail: "Angalia Maelezo ya Kozi",
    notEnrolledTitle: "Ufikiaji Umekataliwa",
    notEnrolledDesc: "Hujapangiwa kozi hii",
    notEnrolledHint: "Tafadhali wasiliana na mwalimu wako ili akupange, au tumia kiungo kilichoshirikiwa.",
    courseFinishedTitle: "Kozi Imekamilika",
    courseFinishedDesc: "Darasa hili limekamilika, huwezi kuingia",
    courseFinishedHint: "Ikiwa unahitaji kupitia upya, tafadhali angalia chini ya kichupo cha 'Kamilika' baadaye.",
    courseCancelledTitle: "Kozi Imefutwa",
    courseCancelledDesc: "Darasa hili limefutwa",
    courseCancelledHint: "Ikiwa una maswali, tafadhali wasiliana na mwalimu wa kozi.",
    notFoundTitle: "Kozi Haipatikani",
    notFoundDesc: "Kiungo si halali au kozi imefutwa",
    notFoundHint: "Tafadhali thibitisha kiungo, au rudi kwenye ukurasa wa nyumbani kuchagua kozi.",
    defaultTitle: "Huwezi Kuingia Darasani",
    defaultDesc: "Muda huu huwezi kufikia kozi hii",
    defaultHint: "Ikiwa unaamini hili ni kosa, tafadhali wasiliana na mwalimu wako.",
  },
};

function IconForType({ type }: { type: "lock" | "clock" | "x-circle" | "search" }) {
  const cls = "h-8 w-8";
  switch (type) {
    case "clock":
      return <Clock className={cls} />;
    case "x-circle":
      return <XCircle className={cls} />;
    case "search":
      return <Search className={cls} />;
    default:
      return <Lock className={cls} />;
  }
}

export function AccessDeniedView({
  code,
  reason,
  courseName,
  courseId,
}: {
  code?: CourseAccessDeniedCode | null;
  reason?: string;
  courseName?: string;
  courseId?: string;
}) {
  const { locale, t } = useTranslation();
  const activeLang = locale in LOCALIZED_DENIED_TEXT ? locale : "en";
  const texts = LOCALIZED_DENIED_TEXT[activeLang];

  const resolvedCode: CourseAccessDeniedCode =
    code === "not_enrolled" ||
    code === "course_not_started" ||
    code === "course_finished" ||
    code === "course_cancelled" ||
    code === "not_found"
      ? code
      : "default";

  // Resolve metadata style configs
  let icon: "lock" | "clock" | "x-circle" | "search" = "lock";
  let title = texts.defaultTitle;
  let description = reason || texts.defaultDesc;
  let hint = texts.defaultHint;

  if (resolvedCode === "not_enrolled") {
    icon = "lock";
    title = texts.notEnrolledTitle;
    description = texts.notEnrolledDesc;
    hint = texts.notEnrolledHint;
  } else if (resolvedCode === "course_not_started") {
    icon = "clock";
    title = texts.notStartedTitle || t("accessDenied.placeReserved");
    description = texts.notStartedDesc || t("accessDenied.earlyEntryDescription");
    hint = texts.notStartedHint || t("accessDenied.joinEarlyTip");
  } else if (resolvedCode === "course_finished") {
    icon = "clock";
    title = texts.courseFinishedTitle;
    description = texts.courseFinishedDesc;
    hint = texts.courseFinishedHint;
  } else if (resolvedCode === "course_cancelled") {
    icon = "x-circle";
    title = texts.courseCancelledTitle;
    description = texts.courseCancelledDesc;
    hint = texts.courseCancelledHint;
  } else if (resolvedCode === "not_found") {
    icon = "search";
    title = texts.notFoundTitle;
    description = texts.notFoundDesc;
    hint = texts.notFoundHint;
  }

  return (
    <div className={styles.page} data-workspace-shell>
      <header className={styles.header} data-workspace-header data-access-header>
        <div data-workspace-header-actions><Link href="/" className={styles.back}><ArrowLeft size={16}/><span>{texts.viewList}</span></Link></div>
        <span className={styles.brand}>{t("login.title")}</span>
      </header>
      <main className={styles.main}>
        <section className={styles.panel} aria-labelledby="access-state-title">
          <div className={styles.icon}><IconForType type={icon}/></div>
          {courseName && <p className={styles.course}>{courseName}</p>}
          <h1 id="access-state-title">{title}</h1>
          <p className={styles.description}>{description}</p>
          <div className={styles.hint}>{hint}</div>
          <div className={styles.actions}>
            {courseId && <Link className={styles.primary} href={`/courses/${courseId}`}>{texts.viewDetail}<ArrowRight size={15}/></Link>}
            <Link className={courseId ? styles.secondary : styles.primary} href="/">{texts.viewList}</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
