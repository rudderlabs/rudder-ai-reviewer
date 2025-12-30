import type { FileSystem } from '@custom-types/file.type';

export function createMockFileSystem(files: Record<string, string>): FileSystem {
  return {
    exists: (path: string) => path in files,
    read: (path: string) => {
      if (!(path in files)) throw new Error(`File not found: ${path}`);
      return files[path];
    },
    join: (...paths: string[]) => paths.join('/'),
  };
}
