'use strict';
function registration(body = {}) {
  if (typeof body.phone !== 'string' || !/^\+[1-9]\d{5,14}$/.test(body.phone.trim())) return {error:'invalid_phone'};
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) return {error:'weak_password'};
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return {error:'invalid_username'};
  if (body.display_name != null && typeof body.display_name !== 'string') return {error:'invalid_display_name'};
  return {phone:body.phone.trim(), username, password:body.password,
    display_name:(body.display_name || '').trim().slice(0,64) || username};
}
function duplicateAccount(error) {
  return error.code === 'ER_DUP_ENTRY' || error.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    (error.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed: users\./.test(error.message));
}
module.exports = {registration, duplicateAccount};
