export const LEGACY_ORG_ID = 'org_aguero_default';

/** Maps a missing or legacy org id to the real company org (env DEFAULT_ORG_ID). */
export const effectiveOrg = (id?: string): string =>
  !id || id === LEGACY_ORG_ID ? process.env.DEFAULT_ORG_ID || LEGACY_ORG_ID : id;
