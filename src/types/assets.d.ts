// Vite's `?inline` query imports a CSS file as a string.
declare module '*.css?inline' {
  const css: string;
  export default css;
}
