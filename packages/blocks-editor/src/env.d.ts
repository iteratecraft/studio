// A style sheet imported as text (the build tool's `?inline`), for the block previews.
declare module "*.css?inline" {
  const css: string;
  export default css;
}
