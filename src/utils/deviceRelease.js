/**
 * Letting go of a Hub without destroying its pairing record.
 *
 * COPY RULE: byte-identical with C:\App\WattWise-Web\src\utils\deviceRelease.js
 * (that copy has CRLF line endings, this one LF).
 *
 * WHY RELEASE RATHER THAN DELETE
 *
 * Unlinking used to `deleteDoc(devices/{deviceId})`. That left the identifier
 * unclaimed, and the security rule for `create` asks only that the writer name
 * themselves as the owner - it cannot check a device token, because a rule
 * cannot see a secret. So for as long as the document was missing, any signed-in
 * account that guessed the deviceId could claim it. `ESP32_ROOM_A` is printed in
 * the capstone paper.
 *
 * The impact was bounded - the squatter writes their own token, so the real Hub
 * fails authentication and posts nothing to them - but "bounded" there means
 * denial of service on the one piece of hardware the study runs on, during the
 * five beta sessions when Remove Device is most likely to be pressed.
 *
 * Releasing keeps the document and removes only its owner. `create` never
 * applies to a document that exists, so the window never opens. The rule now
 * also denies `delete` outright, which turns this from a convention into
 * something enforced.
 *
 * `deleteAccount` on the backend already worked this way and its comment says
 * why in the other direction: the pairing record is for a physical unit that
 * still exists on someone's wall, and deleting it would leave hardware that
 * cannot be re-paired without being reflashed. The field names below match what
 * it writes, so both paths leave the same shape.
 *
 * THE TOKENS GO TOO
 *
 * A released record is owned by nobody, so `resolveUserByDeviceId` returns
 * nothing and the token is never read. Clearing it anyway: a credential should
 * not sit on a record no account is answerable for, and the rotation grace
 * fields are a credential with a timer on them.
 */

/**
 * Fields that detach a Hub from its owner while keeping the pairing record.
 *
 * The sentinels are passed in rather than imported so this stays testable
 * without a Firestore connection - `removeUserId` is the SDK's `deleteField()`,
 * and `releasedAt` its `serverTimestamp()` or a Date.
 *
 * `userId` MUST be removed rather than set to null or to any string. The
 * security rule permits this write only when the result carries no `userId` at
 * all; a null would fail it, and a string would hand the device to whoever that
 * string names.
 *
 * @param {*} removeUserId  deleteField() sentinel.
 * @param {*} releasedAt    serverTimestamp() sentinel, or a Date.
 * @param {string} releasedReason  Why it was let go. Kept short and non-secret.
 * @returns {object} Merge payload for devices/{deviceId}.
 */
export const buildReleasedDeviceFields = (removeUserId, releasedAt, releasedReason) => ({
  userId: removeUserId,
  deviceToken: null,
  previousDeviceToken: null,
  previousDeviceTokenValidUntilMs: null,
  tokenRotatedAtMs: null,
  active: false,
  releasedAt,
  releasedReason,
});

/** Why a device record was released. Values are written to a shared document. */
export const RELEASE_REASONS = {
  UNLINKED: 'unlinked_by_user',
  REPLACED: 'replaced_by_another_device',
};
