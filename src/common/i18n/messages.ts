import type { Language } from '../../config/constants';

/**
 * Localized API error messages keyed by error code (architecture §5.2, NFR-UX-04).
 * The exception filter resolves the message from the request's Accept-Language
 * (fallback: user's stored language, then `ar`). Catalog labels (En/Ar) are
 * returned by module mappers separately.
 */
type Catalog = Record<string, { ar: string; en: string }>;

const CATALOG: Catalog = {
  NOT_FOUND: { ar: 'المورد غير موجود', en: 'Resource not found' },
  VALIDATION_FAILED: { ar: 'البيانات غير صالحة', en: 'Validation failed' },
  RATE_LIMITED: { ar: 'طلبات كثيرة جدا، حاول لاحقا', en: 'Too many requests, please try again later' },
  UNAUTHORIZED: { ar: 'يجب تسجيل الدخول', en: 'Authentication required' },
  FORBIDDEN: { ar: 'ليس لديك صلاحية لهذا الإجراء', en: 'You do not have permission for this action' },
  ACCOUNT_SUSPENDED: { ar: 'تم إيقاف حسابك', en: 'Your account has been suspended' },
  EMAIL_VERIFICATION_REQUIRED: {
    ar: 'يجب تأكيد البريد الإلكتروني أولا',
    en: 'Email verification is required first',
  },
  FEATURE_DISABLED: { ar: 'هذه الميزة غير مفعّلة', en: 'This feature is disabled' },
  IDEMPOTENCY_CONFLICT: { ar: 'تعارض في مفتاح التكرار', en: 'Idempotency key conflict' },
  INTERNAL_ERROR: { ar: 'حدث خطأ، حاول لاحقا', en: 'Something went wrong, please try again' },
  SERVICE_UNAVAILABLE: { ar: 'الخدمة غير متاحة مؤقتا', en: 'Service temporarily unavailable' },
  BAD_GATEWAY: { ar: 'خطأ في مزود خارجي', en: 'Upstream provider error' },
  CONFLICT: { ar: 'تعارض في البيانات', en: 'Resource conflict' },

  AUTH_OTP_EXPIRED: { ar: 'انتهت صلاحية الرمز', en: 'The code has expired' },
  AUTH_OTP_INVALID: { ar: 'الرمز غير صحيح', en: 'The code is invalid' },
  AUTH_OTP_MAX_ATTEMPTS: { ar: 'تجاوزت عدد المحاولات', en: 'Too many attempts' },
  AUTH_OTP_RESEND_COOLDOWN: {
    ar: 'انتظر قبل طلب رمز جديد',
    en: 'Please wait before requesting a new code',
  },
  AUTH_CREDENTIALS_INVALID: { ar: 'بيانات الدخول غير صحيحة', en: 'Invalid credentials' },
  AUTH_ACCOUNT_LOCKED: { ar: 'تم قفل الحساب مؤقتا', en: 'Account temporarily locked' },
  AUTH_REFRESH_REUSED: { ar: 'انتهت الجلسة، سجل دخول مجددا', en: 'Session expired, please sign in again' },
  AUTH_EMAIL_EXISTS: { ar: 'البريد مستخدم بالفعل', en: 'Email already in use' },
  AUTH_EMAIL_NOT_VERIFIED: { ar: 'البريد غير مؤكد', en: 'Email is not verified' },
  AUTH_SOCIAL_LINK_CONFLICT: { ar: 'الحساب مرتبط بمزود آخر', en: 'Account is linked to another provider' },
  AUTH_OTP_LAST_CHANNEL: {
    ar: 'لا يمكن إيقاف آخر قناة تفعيل',
    en: 'The last verification channel cannot be disabled',
  },

  PROF_CAPABILITY_EXISTS: { ar: 'الصلاحية ممنوحة بالفعل', en: 'Capability already granted' },
  PROF_BLOCK_EXISTS: { ar: 'تم حظر المستخدم مسبقا', en: 'User is already blocked' },
  PROF_NOT_BLOCKED: { ar: 'المستخدم ليس محظورا', en: 'User is not blocked' },

  CAT_NOT_FOUND: { ar: 'الفئة غير موجودة', en: 'Category not found' },
  CAT_ATTRIBUTE_KEY_EXISTS: { ar: 'مفتاح السمة موجود', en: 'Attribute key already exists' },
  CAT_ATTRIBUTE_IN_USE: { ar: 'السمة مستخدمة ولا يمكن حذفها', en: 'Attribute is in use and cannot be deleted' },
  CAT_POSTING_RESTRICTED: { ar: 'النشر مغلق لهذه الفئة', en: 'Posting is restricted for this category' },

  LST_NOT_FOUND: { ar: 'الإعلان غير موجود', en: 'Listing not found' },
  LST_RATE_LIMIT: { ar: 'أنشأت إعلانات كثيرة، حاول لاحقا', en: 'Too many listings created, try later' },
  LST_ACTIVE_CAP: { ar: 'وصلت الحد الأقصى للإعلانات النشطة', en: 'Active listing cap reached' },
  LST_MISSING_REQUIRED: { ar: 'حقول مطلوبة ناقصة', en: 'Required fields are missing' },

  SRCH_INVALID_FILTER: { ar: 'مرشح بحث غير صالح', en: 'Invalid search filter' },

  MSG_THREAD_EXISTS: { ar: 'المحادثة موجودة', en: 'Thread already exists' },
  MSG_BLOCKED: { ar: 'لا يمكن مراسلة هذا المستخدم', en: 'Cannot message this user' },
  MSG_THROTTLED: { ar: 'ترسل رسائل كثيرة، أبطئ قليلا', en: 'You are sending messages too fast' },
  MSG_IDEMPOTENT_DUPLICATE: { ar: 'الرسالة مكررة', en: 'Duplicate message' },

  JOB_NOT_FOUND: { ar: 'الوظيفة غير موجودة', en: 'Job not found' },
  JOB_ALREADY_APPLIED: { ar: 'تقدمت لهذه الوظيفة مسبقا', en: 'You already applied to this job' },
  JOB_APPLICATION_LIMIT: { ar: 'تجاوزت حد التقدم اليومي', en: 'Daily application limit reached' },

  TRS_REASON_REQUIRED: { ar: 'سبب الإجراء مطلوب', en: 'A reason is required for this action' },
  TRS_REVIEW_EXISTS: { ar: 'قيّمت هذا التفاعل مسبقا', en: 'You already reviewed this interaction' },
  TRS_REVIEW_NOT_ELIGIBLE: { ar: 'غير مؤهل للتقييم بعد', en: 'Not eligible to review yet' },

  PAY_NOT_FOUND: { ar: 'الدفع غير موجود', en: 'Payment not found' },
  PAY_RECEIPT_FRAUD: { ar: 'اشتباه تزوير في الإيصال', en: 'Receipt fraud detected' },

  ADM_LAST_SUPER_ADMIN: { ar: 'لا يمكن إزالة آخر مدير عام', en: 'Cannot remove the last Super Admin' },
  ADM_TOTP_REQUIRED: { ar: 'مطلوب تأكيد بخطوتين', en: 'Two-factor authentication is required' },
  SYS_AUDIT_CHAIN_BROKEN: { ar: 'سلسلة التدقيق معطوبة', en: 'Audit chain verification failed' },
  DEFAULTS_INVALID_TYPE: { ar: 'نوع القيمة غير صالح', en: 'Invalid value type for this setting' },
  DEFAULTS_VALUE_OUT_OF_RANGE: { ar: 'القيمة خارج النطاق المسموح', en: 'Value is out of the allowed range' },
  CONFIG_INVALID: { ar: 'بيانات الإعداد غير صالحة', en: 'Invalid configuration data' },
};

/** Resolve a localized message for a code. Falls back to English, then the code itself. */
export function localizeError(code: string, lang: Language): string {
  const entry = CATALOG[code];
  if (!entry) return code;
  return entry[lang] ?? entry.en ?? code;
}
