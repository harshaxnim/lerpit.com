/**
 * The machinery behind an in-article code editor: the editor itself, the two
 * compilers, and the two parsers that link a mixtape's fence to a source file.
 *
 * It lives here rather than in a lesson's `code/shared/` because every lesson that
 * sets an exercise needs all of it, and none of it knows what any lesson is about.
 * What a lesson draws with the result stays in that lesson.
 */
export { createFileEditor } from './fileEditor';
export type { EditorFile, EditorStatus, EditorTab, FileEditor, FileEditorOptions } from './fileEditor';

export { regionMarking, setRegions, toggleHide, toLiveRegions, hasEdits } from './editorRegions';
export type { LiveRegion } from './editorRegions';

export { compileCpp } from './compileCpp';
export type { WasmModule, CompileLog } from './compileCpp';

export { compileJsFiles } from './compileJs';
export type { JsModule } from './compileJs';

export { scanRegions, regionIds, findRegion, deriveSource, hintText, uncomment, REGION_KINDS } from './regions';
export type {
  Region,
  RegionKind,
  RegionProblem,
  RegionScan,
  LineSpan,
  SourceView,
  DerivedRegion,
  DerivedSource
} from './regions';

export { parseFence, tabLabel, FENCE_LANG, FENCE_FLAGS } from './fence';
export type { FenceEntry, FenceSpec } from './fence';

export { loadLiveCodeFile, hasLiveCodeFile } from './sources';
export { createEditorStore, fingerprint } from './editorStore';
export type { EditorStore } from './editorStore';
