'use strict';

const { z } = require('zod');

/** İstemciye giden kullanıcı (snake_case — Flutter modelleri json_serializable ile okur). */
const UserPublic = z.object({
  id: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  display_name: z.string().nullable(),
  photo_url: z.string().nullable(),
  locale: z.string(),
  auth_provider: z.string(),
  created_at: z.string(),
});

/** @param {import('./repository').UserRow} u */
function toUserPublic(u) {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    display_name: u.display_name,
    photo_url: u.photo_url,
    locale: u.locale,
    auth_provider: u.auth_provider,
    created_at: new Date(u.created_at).toISOString(),
  };
}

const UpdateMeBody = z
  .object({
    display_name: z.string().trim().min(1).max(100).optional(),
    locale: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
  })
  .strict();

module.exports = { UserPublic, toUserPublic, UpdateMeBody };
