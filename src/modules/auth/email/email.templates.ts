/**
 * Localized email templates for customer auth (Phase 3).
 * Returns { subject, html, text } for each template + language.
 */

export function otpTemplate(code: string, lang: 'ar' | 'en' = 'ar') {
  if (lang === 'en') {
    return {
      subject: 'Your MARBOU verification code',
      html: `<p>Your verification code is: <strong>${code}</strong></p><p>It expires in 10 minutes.</p><p>Do not share this code.</p>`,
      text: `Your MARBOU verification code: ${code}\nExpires in 10 minutes. Do not share.`,
    };
  }
  return {
    subject: 'رمز التحقق من MARBOU',
    html: `<p dir="rtl">رمز التحقق الخاص بك: <strong>${code}</strong></p><p dir="rtl">ينتهي خلال 10 دقائق.</p><p dir="rtl">لا تشارك هذا الرمز مع أحد.</p>`,
    text: `رمز التحقق من MARBOU: ${code}\nينتهي خلال 10 دقائق. لا تشاركه.`,
  };
}

export function passwordResetNoticeTemplate(lang: 'ar' | 'en' = 'ar') {
  if (lang === 'en') {
    return {
      subject: 'Your MARBOU password was changed',
      html: '<p>Your password was successfully changed. If you did not make this change, contact support immediately.</p>',
      text: 'Your MARBOU password was changed. If you did not do this, contact support.',
    };
  }
  return {
    subject: 'تم تغيير كلمة المرور في MARBOU',
    html: '<p dir="rtl">تم تغيير كلمة المرور بنجاح. إذا لم تقم بذلك، تواصل مع الدعم فوراً.</p>',
    text: 'تم تغيير كلمة المرور في MARBOU. إذا لم تقم بذلك، تواصل مع الدعم.',
  };
}

export function emailChangedNoticeTemplate(newEmail: string, lang: 'ar' | 'en' = 'ar') {
  if (lang === 'en') {
    return {
      subject: 'Your MARBOU email address was changed',
      html: `<p>Your email address was changed to <strong>${newEmail}</strong>. If you did not do this, contact support.</p>`,
      text: `Your MARBOU email was changed to ${newEmail}. If you did not do this, contact support.`,
    };
  }
  return {
    subject: 'تم تغيير البريد الإلكتروني في MARBOU',
    html: `<p dir="rtl">تم تغيير بريدك الإلكتروني إلى <strong>${newEmail}</strong>. إذا لم تقم بذلك، تواصل مع الدعم.</p>`,
    text: `تم تغيير بريدك الإلكتروني إلى ${newEmail}. إذا لم تقم بذلك، تواصل مع الدعم.`,
  };
}
