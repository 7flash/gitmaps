/** @jsxImportSource tradjs/client */
/**
 * Dynamic catch-all slug route — renders the same canvas page as root.
 * URL: /foo, /owner/repo, /group/subgroup/repo, etc.
 * The full slug is read client-side from window.location.pathname.
 */
export { default } from '../page';
