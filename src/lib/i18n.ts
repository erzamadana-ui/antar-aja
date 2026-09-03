// Multi-bahasa: Indonesia (default), Inggris, Mandarin, Arab (RTL).
// Pemakaian: const t = useT(); t('home')  — kunci yang belum diterjemahkan jatuh ke Indonesia.
import { create } from 'zustand';
import { I18nManager, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Locale } from './types';

const KEY = 'antaraja.locale';
export const LOCALES: { code: Locale; label: string; native: string; flag: string; rtl?: boolean }[] = [
  { code: 'id', label: 'Indonesia', native: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'en', label: 'English', native: 'English', flag: '🇬🇧' },
  { code: 'zh', label: 'Mandarin', native: '中文', flag: '🇨🇳' },
  { code: 'ar', label: 'Arab', native: 'العربية', flag: '🇸🇦', rtl: true },
];

const id = {
  // umum
  home: 'Beranda', orders: 'Pesanan', pay: 'AntarPay', account: 'Akun', history: 'Riwayat', earnings: 'Pendapatan', menu: 'Menu', store: 'Toko',
  back: 'Kembali', save: 'Simpan', cancel: 'Batal', confirm: 'Konfirmasi', close: 'Tutup', yes: 'Ya', no: 'Tidak', ok: 'OK', done: 'Selesai', next: 'Lanjut', search: 'Cari', loading: 'Memuat…',
  login: 'Masuk', register: 'Daftar', logout: 'Keluar', email: 'Email', password: 'Kata sandi', full_name: 'Nama lengkap', phone: 'Nomor HP',
  welcome_back: 'Selamat datang kembali', login_sub: 'Masuk untuk mulai memesan.', no_account: 'Belum punya akun?', have_account: 'Sudah punya akun?',
  create_account: 'Buat Akun', start_now: 'Mulai sekarang', start_sub: 'Daftar gratis, pesan dalam hitungan detik.', welcome_tag: 'Ojek, mobil, makanan, kirim barang, dan belanja.\nSatu aplikasi untuk semua kebutuhan harian.',
  partner_hint: 'Ingin jadi mitra driver atau merchant? Daftar akun lalu buka menu Akun.',
  greeting_morning: 'Selamat pagi', greeting_noon: 'Selamat siang', greeting_afternoon: 'Selamat sore', greeting_evening: 'Selamat malam',
  search_placeholder: 'Cari makanan, restoran, tempat…', balance: 'Saldo AntarPay', topup: 'Top Up', withdraw: 'Tarik Saldo', active_orders: 'Pesanan berjalan', promo_for_you: 'Promo untukmu', trending_food: 'Lagi laris di AntarFood', see_all: 'Lihat semua',
  track: 'Lacak', chat: 'Chat', call: 'Telepon', driver: 'Driver', customer: 'Pelanggan', merchant: 'Merchant', admin: 'Admin', cash: 'Tunai', wallet: 'AntarPay',
  pickup: 'Titik jemput', destination: 'Tujuan', where_to: 'Mau ke mana?', my_location: 'Lokasi saya', pick_destination: 'Pilih tujuan untuk melihat tarif.', estimate: 'Estimasi biaya', payment: 'Pembayaran', order_now: 'Pesan',
  tip: 'Tip driver', give_tip: 'Beri tip', extra_fee: 'Biaya tambahan', approve: 'Setujui', reject: 'Tolak', parking: 'Parkir', toll: 'Tol', waiting: 'Waktu tunggu', other: 'Lainnya',
  shop: 'Belanja', shopping_list: 'Daftar belanja', budget: 'Perkiraan anggaran', store_pick: 'Pilih toko', add_item: 'Tambah barang',
  language: 'Bahasa', choose_language: 'Pilih bahasa', language_saved: 'Bahasa disimpan', rtl_note: 'Tata letak kanan-ke-kiri aktif setelah aplikasi dimuat ulang.',
  incoming_call: 'Panggilan masuk', calling: 'Memanggil…', connecting: 'Menghubungkan…', in_call: 'Tersambung', call_ended: 'Panggilan berakhir', answer: 'Angkat', decline: 'Tolak', end_call: 'Akhiri', mute: 'Bisukan', speaker: 'Speaker',
  call_privacy: 'Nomor HP tidak dibagikan — panggilan lewat aplikasi (sesuai UU PDP).',
  pay_with: 'Bayar dengan', ewallet: 'E-wallet / QRIS / VA Bank', pay_now: 'Bayar sekarang', payment_success: 'Pembayaran berhasil', payment_pending: 'Menunggu pembayaran', simulation: 'Mode simulasi',
  edit_profile: 'Edit profil', saved_places: 'Alamat tersimpan', help: 'Bantuan & FAQ', mode_partner: 'Mode & Kemitraan', others: 'Lainnya',
  become_driver: 'Daftar jadi Mitra Driver', become_merchant: 'Daftar jadi Merchant AntarFood', switch_driver: 'Beralih ke Mode Driver', switch_merchant: 'Beralih ke Mode Merchant', switch_customer: 'Beralih ke Mode Pelanggan', admin_panel: 'Panel Admin',
  status_searching: 'Mencari driver', status_accepted: 'Driver menuju lokasi', status_arrived: 'Driver sudah tiba', status_in_progress: 'Dalam perjalanan', status_completed: 'Selesai', status_cancelled: 'Dibatalkan',
  online: 'ONLINE', offline: 'OFFLINE', orders_available: 'order tersedia', accept_order: 'Terima Order', active_order: 'Order aktif',
};
export type TKey = keyof typeof id;

const en: Partial<Record<TKey, string>> = {
  home: 'Home', orders: 'Orders', account: 'Account', history: 'History', earnings: 'Earnings', menu: 'Menu', store: 'Store',
  back: 'Back', save: 'Save', cancel: 'Cancel', confirm: 'Confirm', close: 'Close', yes: 'Yes', no: 'No', done: 'Done', next: 'Next', search: 'Search', loading: 'Loading…',
  login: 'Sign in', register: 'Sign up', logout: 'Sign out', password: 'Password', full_name: 'Full name', phone: 'Phone number',
  welcome_back: 'Welcome back', login_sub: 'Sign in to start ordering.', no_account: "Don't have an account?", have_account: 'Already have an account?',
  create_account: 'Create Account', start_now: 'Get started', start_sub: 'Free to join, order in seconds.', welcome_tag: 'Rides, cars, food, parcels and shopping.\nOne app for everyday needs.',
  partner_hint: 'Want to be a driver or merchant partner? Sign up, then open Account.',
  greeting_morning: 'Good morning', greeting_noon: 'Good afternoon', greeting_afternoon: 'Good afternoon', greeting_evening: 'Good evening',
  search_placeholder: 'Search food, restaurants, places…', balance: 'AntarPay balance', topup: 'Top Up', withdraw: 'Withdraw', active_orders: 'Active orders', promo_for_you: 'Promos for you', trending_food: 'Trending on AntarFood', see_all: 'See all',
  track: 'Track', chat: 'Chat', call: 'Call', driver: 'Driver', customer: 'Customer', merchant: 'Merchant', admin: 'Admin', cash: 'Cash',
  pickup: 'Pickup', destination: 'Destination', where_to: 'Where to?', my_location: 'My location', pick_destination: 'Pick a destination to see the fare.', estimate: 'Estimated fare', payment: 'Payment', order_now: 'Order',
  tip: 'Driver tip', give_tip: 'Give a tip', extra_fee: 'Extra fee', approve: 'Approve', reject: 'Reject', parking: 'Parking', toll: 'Toll', waiting: 'Waiting time', other: 'Other',
  shop: 'Shop', shopping_list: 'Shopping list', budget: 'Estimated budget', store_pick: 'Choose store', add_item: 'Add item',
  language: 'Language', choose_language: 'Choose language', language_saved: 'Language saved', rtl_note: 'Right-to-left layout applies after the app reloads.',
  incoming_call: 'Incoming call', calling: 'Calling…', connecting: 'Connecting…', in_call: 'Connected', call_ended: 'Call ended', answer: 'Answer', decline: 'Decline', end_call: 'End', mute: 'Mute', speaker: 'Speaker',
  call_privacy: 'Phone numbers are never shared — calls go through the app (privacy law compliant).',
  pay_with: 'Pay with', ewallet: 'E-wallet / QRIS / Bank VA', pay_now: 'Pay now', payment_success: 'Payment successful', payment_pending: 'Awaiting payment', simulation: 'Simulation mode',
  edit_profile: 'Edit profile', saved_places: 'Saved places', help: 'Help & FAQ', mode_partner: 'Modes & Partnership', others: 'Others',
  become_driver: 'Become a Driver Partner', become_merchant: 'Become an AntarFood Merchant', switch_driver: 'Switch to Driver Mode', switch_merchant: 'Switch to Merchant Mode', switch_customer: 'Switch to Customer Mode', admin_panel: 'Admin Panel',
  status_searching: 'Finding a driver', status_accepted: 'Driver on the way', status_arrived: 'Driver has arrived', status_in_progress: 'On the way', status_completed: 'Completed', status_cancelled: 'Cancelled',
  online: 'ONLINE', offline: 'OFFLINE', orders_available: 'orders available', accept_order: 'Accept Order', active_order: 'Active order',
};

const zh: Partial<Record<TKey, string>> = {
  home: '首页', orders: '订单', account: '账户', history: '历史', earnings: '收入', menu: '菜单', store: '店铺',
  back: '返回', save: '保存', cancel: '取消', confirm: '确认', close: '关闭', yes: '是', no: '否', done: '完成', next: '下一步', search: '搜索', loading: '加载中…',
  login: '登录', register: '注册', logout: '退出登录', email: '邮箱', password: '密码', full_name: '姓名', phone: '手机号',
  welcome_back: '欢迎回来', login_sub: '登录后即可下单。', no_account: '还没有账户？', have_account: '已有账户？',
  create_account: '创建账户', start_now: '立即开始', start_sub: '免费注册，几秒下单。', welcome_tag: '摩托、汽车、外卖、快递与代购。\n一个应用满足日常所需。',
  partner_hint: '想成为司机或商家合作伙伴？注册后打开“账户”。',
  greeting_morning: '早上好', greeting_noon: '中午好', greeting_afternoon: '下午好', greeting_evening: '晚上好',
  search_placeholder: '搜索美食、餐厅、地点…', balance: 'AntarPay 余额', topup: '充值', withdraw: '提现', active_orders: '进行中的订单', promo_for_you: '为您推荐的优惠', trending_food: 'AntarFood 热门', see_all: '查看全部',
  track: '追踪', chat: '聊天', call: '通话', driver: '司机', customer: '顾客', merchant: '商家', admin: '管理员', cash: '现金',
  pickup: '上车点', destination: '目的地', where_to: '去哪里？', my_location: '我的位置', pick_destination: '选择目的地查看价格。', estimate: '预估费用', payment: '支付', order_now: '下单',
  tip: '司机小费', give_tip: '给小费', extra_fee: '附加费用', approve: '同意', reject: '拒绝', parking: '停车费', toll: '过路费', waiting: '等候时间', other: '其他',
  shop: '代购', shopping_list: '购物清单', budget: '预算', store_pick: '选择店铺', add_item: '添加商品',
  language: '语言', choose_language: '选择语言', language_saved: '语言已保存', rtl_note: '从右到左布局将在应用重新加载后生效。',
  incoming_call: '来电', calling: '呼叫中…', connecting: '连接中…', in_call: '通话中', call_ended: '通话结束', answer: '接听', decline: '拒绝', end_call: '挂断', mute: '静音', speaker: '扬声器',
  call_privacy: '手机号不会被共享——通话通过应用进行（符合隐私法规）。',
  pay_with: '支付方式', ewallet: '电子钱包 / QRIS / 银行VA', pay_now: '立即支付', payment_success: '支付成功', payment_pending: '等待支付', simulation: '模拟模式',
  edit_profile: '编辑资料', saved_places: '已保存地址', help: '帮助与常见问题', mode_partner: '模式与合作', others: '其他',
  become_driver: '成为司机合作伙伴', become_merchant: '成为 AntarFood 商家', switch_driver: '切换到司机模式', switch_merchant: '切换到商家模式', switch_customer: '切换到顾客模式', admin_panel: '管理面板',
  status_searching: '正在寻找司机', status_accepted: '司机正在前来', status_arrived: '司机已到达', status_in_progress: '行程中', status_completed: '已完成', status_cancelled: '已取消',
  online: '在线', offline: '离线', orders_available: '个可接订单', accept_order: '接单', active_order: '进行中的订单',
};

const ar: Partial<Record<TKey, string>> = {
  home: 'الرئيسية', orders: 'الطلبات', account: 'الحساب', history: 'السجل', earnings: 'الأرباح', menu: 'القائمة', store: 'المتجر',
  back: 'رجوع', save: 'حفظ', cancel: 'إلغاء', confirm: 'تأكيد', close: 'إغلاق', yes: 'نعم', no: 'لا', done: 'تم', next: 'التالي', search: 'بحث', loading: 'جارٍ التحميل…',
  login: 'تسجيل الدخول', register: 'إنشاء حساب', logout: 'تسجيل الخروج', email: 'البريد الإلكتروني', password: 'كلمة المرور', full_name: 'الاسم الكامل', phone: 'رقم الهاتف',
  welcome_back: 'مرحبًا بعودتك', login_sub: 'سجّل الدخول لبدء الطلب.', no_account: 'ليس لديك حساب؟', have_account: 'لديك حساب بالفعل؟',
  create_account: 'إنشاء حساب', start_now: 'ابدأ الآن', start_sub: 'التسجيل مجاني، اطلب في ثوانٍ.', welcome_tag: 'دراجات، سيارات، طعام، طرود وتسوّق.\nتطبيق واحد لكل احتياجاتك اليومية.',
  partner_hint: 'تريد أن تصبح سائقًا أو تاجرًا شريكًا؟ أنشئ حسابًا ثم افتح "الحساب".',
  greeting_morning: 'صباح الخير', greeting_noon: 'طاب يومك', greeting_afternoon: 'مساء الخير', greeting_evening: 'مساء الخير',
  search_placeholder: 'ابحث عن طعام أو مطعم أو مكان…', balance: 'رصيد AntarPay', topup: 'شحن الرصيد', withdraw: 'سحب', active_orders: 'الطلبات الجارية', promo_for_you: 'عروض لك', trending_food: 'الأكثر طلبًا في AntarFood', see_all: 'عرض الكل',
  track: 'تتبّع', chat: 'دردشة', call: 'اتصال', driver: 'السائق', customer: 'العميل', merchant: 'التاجر', admin: 'المشرف', cash: 'نقدًا',
  pickup: 'نقطة الانطلاق', destination: 'الوجهة', where_to: 'إلى أين؟', my_location: 'موقعي', pick_destination: 'اختر الوجهة لعرض السعر.', estimate: 'التكلفة التقديرية', payment: 'الدفع', order_now: 'اطلب',
  tip: 'إكرامية السائق', give_tip: 'أعطِ إكرامية', extra_fee: 'رسوم إضافية', approve: 'موافقة', reject: 'رفض', parking: 'موقف السيارات', toll: 'رسوم الطريق', waiting: 'وقت الانتظار', other: 'أخرى',
  shop: 'تسوّق', shopping_list: 'قائمة التسوق', budget: 'الميزانية التقديرية', store_pick: 'اختر المتجر', add_item: 'إضافة عنصر',
  language: 'اللغة', choose_language: 'اختر اللغة', language_saved: 'تم حفظ اللغة', rtl_note: 'يُطبَّق التخطيط من اليمين إلى اليسار بعد إعادة تحميل التطبيق.',
  incoming_call: 'مكالمة واردة', calling: 'جارٍ الاتصال…', connecting: 'جارٍ التوصيل…', in_call: 'متصل', call_ended: 'انتهت المكالمة', answer: 'رد', decline: 'رفض', end_call: 'إنهاء', mute: 'كتم', speaker: 'مكبّر الصوت',
  call_privacy: 'لا تتم مشاركة أرقام الهاتف — المكالمات عبر التطبيق (متوافق مع قانون حماية البيانات).',
  pay_with: 'الدفع عبر', ewallet: 'محفظة إلكترونية / QRIS / حساب بنكي', pay_now: 'ادفع الآن', payment_success: 'تم الدفع بنجاح', payment_pending: 'بانتظار الدفع', simulation: 'وضع المحاكاة',
  edit_profile: 'تعديل الملف الشخصي', saved_places: 'العناوين المحفوظة', help: 'المساعدة والأسئلة الشائعة', mode_partner: 'الأوضاع والشراكة', others: 'أخرى',
  become_driver: 'كن سائقًا شريكًا', become_merchant: 'كن تاجرًا في AntarFood', switch_driver: 'التبديل إلى وضع السائق', switch_merchant: 'التبديل إلى وضع التاجر', switch_customer: 'التبديل إلى وضع العميل', admin_panel: 'لوحة المشرف',
  status_searching: 'جارٍ البحث عن سائق', status_accepted: 'السائق في الطريق', status_arrived: 'وصل السائق', status_in_progress: 'في الطريق', status_completed: 'مكتمل', status_cancelled: 'ملغى',
  online: 'متصل', offline: 'غير متصل', orders_available: 'طلبات متاحة', accept_order: 'قبول الطلب', active_order: 'طلب نشط',
};

const DICT: Record<Locale, Partial<Record<TKey, string>>> = { id, en, zh, ar };

interface I18nState { locale: Locale; loaded: boolean; load: () => Promise<void>; setLocale: (l: Locale) => Promise<void> }
export const useI18n = create<I18nState>((set) => ({
  locale: 'id', loaded: false,
  load: async () => {
    try { const v = (await AsyncStorage.getItem(KEY)) as Locale | null; if (v && DICT[v]) set({ locale: v }); } catch { /* noop */ }
    set({ loaded: true });
  },
  setLocale: async (locale) => {
    set({ locale });
    try { await AsyncStorage.setItem(KEY, locale); } catch { /* noop */ }
    applyDirection(locale);
  },
}));

export function applyDirection(locale: Locale) {
  const rtl = !!LOCALES.find((l) => l.code === locale)?.rtl;
  if (Platform.OS === 'web' && typeof document !== 'undefined') { document.documentElement.dir = rtl ? 'rtl' : 'ltr'; document.documentElement.lang = locale; }
  else if (I18nManager.isRTL !== rtl) { I18nManager.allowRTL(rtl); I18nManager.forceRTL(rtl); }
}

export function translate(locale: Locale, key: TKey, vars?: Record<string, string | number>): string {
  let s = DICT[locale][key] ?? id[key] ?? key;
  if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.replace(`{${k}}`, String(v)); });
  return s;
}

/** Hook terjemahan: t('key'). Re-render saat bahasa berubah. */
export function useT() {
  const locale = useI18n((s) => s.locale);
  return (key: TKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
export const isRTL = (locale: Locale) => !!LOCALES.find((l) => l.code === locale)?.rtl;
