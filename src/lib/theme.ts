export const THEME_STORAGE_KEY = "stripe-api-viewer:theme";
export type Theme = "light" | "dark";

// Runs before paint; storage may be unavailable in private/restricted browsers.
export const themeBootstrap = `(()=>{let theme="light";try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="dark")theme="dark"}catch{}document.documentElement.dataset.theme=theme})()`;
