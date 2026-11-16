/*
 * P05 prototype: shared database settings.
 * The publishable key only allows reading (row level security). It is safe to ship in a page.
 * Team write keys are NEVER put here; a tester types the P05 key into the Data tab, and it stays in that browser.
 */
(function (root) {
  root.P05_CONFIG = {
    supabaseUrl: 'https://zbcgneyhwuswyxeaufjh.supabase.co',
    publishableKey: 'sb_publishable_YFs2qxwH6YU7-F-_8_ppoQ_-hW861yy',
    aiFunction: 'ai-suggest',
    timeoutMs: 8000
  };
})(typeof self !== 'undefined' ? self : this);
