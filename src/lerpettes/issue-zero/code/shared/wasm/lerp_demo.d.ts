type LerpDemoFactoryOptions = {
  locateFile?: (path: string, prefix?: string) => string;
};

type LerpDemoModule = {
  lerp_f32: (a: number, b: number, t: number) => number;
};

declare function createLerpDemoModule(options?: LerpDemoFactoryOptions): Promise<LerpDemoModule>;

export default createLerpDemoModule;
