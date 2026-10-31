// Tipos de constants.mjs (para os testes em TypeScript).
export declare const TUNE_FILES: string[];
export declare function locate(src: string, name: string): { start: number; end: number } | null;
export declare function readConstant(src: string, name: string): number | null;
export declare function writeConstant(src: string, name: string, value: number): string;
export declare function formatNumber(v: number): string;
export declare function whereIs(names: string[], root?: string): Record<string, string>;
