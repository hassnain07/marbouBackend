import { z } from 'zod';
import { AUTH_PASSWORD_MIN_LENGTH, AUTH_PASSWORD_MAX_LENGTH, AUTH_PASSWORD_REGEX } from '../auth.constants';

const passwordField = z
  .string()
  .min(AUTH_PASSWORD_MIN_LENGTH)
  .max(AUTH_PASSWORD_MAX_LENGTH)
  .refine((v) => AUTH_PASSWORD_REGEX.test(v), {
    message: `Password must contain at least one letter and one digit`,
  });

const emailField = z.string().email().transform((v) => v.trim().toLowerCase());

export const registerSchema = z.object({
  email: emailField,
  password: passwordField,
  fullName: z.string().min(1).max(100),
  language: z.enum(['AR', 'EN']).optional(),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const otpRequestSchema = z.object({
  email: emailField.optional(),
  purpose: z.enum(['REGISTER', 'RESET', 'CHANGE_EMAIL', 'PHONE']),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']).optional(),
});
export type OtpRequestDto = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  email: emailField.optional(),
  purpose: z.enum(['REGISTER', 'RESET', 'CHANGE_EMAIL', 'PHONE']),
  code: z.string().regex(/^\d{6}$/, '6-digit code required'),
});
export type OtpVerifyDto = z.infer<typeof otpVerifySchema>;

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  email: emailField,
  code: z.string().regex(/^\d{6}$/),
  newPassword: passwordField,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordField,
});

export const changeEmailSchema = z.object({
  newEmail: emailField,
  currentPassword: z.string().min(1).optional(),
});

export const confirmEmailSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export const updatePhoneSchema = z.object({
  phoneNumber: z.string().min(7).max(20),
});

export const socialAuthSchema = z.object({
  idToken: z.string().optional(),
  accessToken: z.string().optional(),
}).refine((v) => v.idToken || v.accessToken, { message: 'idToken or accessToken required' });

export const setStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().max(500).optional(),
});
