export type LerpetteRuntimeContext = {
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  currentStepId: string;
  shared: Map<string, unknown>;
  setCaption: (value: string) => void;
  resolveAssetUrl: (relativePath: string) => string;
};

export type LerpetteStepRuntime = {
  mount: (ctx: LerpetteRuntimeContext) => Promise<void> | void;
  enter?: (ctx: LerpetteRuntimeContext) => Promise<void> | void;
  exit?: (ctx: LerpetteRuntimeContext) => Promise<void> | void;
  resize?: (ctx: LerpetteRuntimeContext) => void;
  dispose?: (ctx: LerpetteRuntimeContext) => void;
};

export type LerpetteStep = {
  id: string;
  title: string;
  bodyHtml: string;
  runtimeImportKey: string;
  assetBasePath: string;
  hasOwnRuntime: boolean;
};

export type LerpetteMixtape = {
  slug: string;
  href: string;
  title: string;
  summary: string;
  publishedOn: string;
  author: string;
  introHtml: string;
  steps: LerpetteStep[];
  collectionSlug?: string;
  collectionTitle?: string;
};

export type LerpetteCollection = {
  slug: string;
  href: string;
  title: string;
  summary: string;
  bodyHtml: string;
  mixtapes: LerpetteMixtape[];
};

export type LerpetteAssetEntry = {
  urlPath: string;
  filePath: string;
  contentType: string;
};

export type LerpetteLibrary = {
  issueZero: LerpetteMixtape;
  collections: LerpetteCollection[];
  mixtapes: LerpetteMixtape[];
  assetEntries: LerpetteAssetEntry[];
};
