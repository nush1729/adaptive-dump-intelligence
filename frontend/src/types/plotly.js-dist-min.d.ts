declare module "plotly.js-dist-min" {
  const Plotly: {
    react: (root: HTMLElement, data: unknown[], layout: unknown, config?: unknown) => Promise<unknown>;
    [key: string]: any;
  };
  export default Plotly;
}
