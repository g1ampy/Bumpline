// Bumpline — the Material Web components the toolbar panel uses, and nothing
// else. tools/material/build.mjs bundles this file into vendor/material.js:
// Manifest v3 refuses a remote script, so the components ship inside the
// package. A component added to popup.html has to be added here too, or its
// tag stays an empty, unstyled box.
import '@material/web/switch/switch.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';
import '@material/web/dialog/dialog.js';
import '@material/web/progress/linear-progress.js';
import '@material/web/menu/menu.js';
import '@material/web/menu/menu-item.js';
import '@material/web/divider/divider.js';
import '@material/web/ripple/ripple.js';
import '@material/web/focus/md-focus-ring.js';
import { styles as typescaleStyles } from '@material/web/typography/md-typescale-styles.js';

// The md-typescale-* classes, for the text the panel sets outside a component.
document.adoptedStyleSheets = [...document.adoptedStyleSheets, typescaleStyles.styleSheet];
