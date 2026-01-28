/**
 * Canonical Pack Builder - Stub
 */

export const PACK_STATUS = {
  EMPTY: "EMPTY",
  PARTIAL: "PARTIAL",
  COMPLETE: "COMPLETE",
};

export function buildCanonicalPack(data) {
  return { status: PACK_STATUS.EMPTY };
}

export function hasCanonicalPack(data) {
  return false;
}

export function getCanonicalPack(data) {
  return null;
}

export function getCanonicalRender(pack, view) {
  return null;
}

export default {
  PACK_STATUS,
  buildCanonicalPack,
  hasCanonicalPack,
  getCanonicalPack,
  getCanonicalRender,
};
