import type { FileSystem } from '@custom-types/file.type';

export function createMockFileSystem(files: Record<string, string>): FileSystem {
  // Build directory structure from files
  const directories = new Set<string>();
  Object.keys(files).forEach(filePath => {
    const parts = filePath.split('/');
    for (let i = 1; i < parts.length; i++) {
      directories.add(parts.slice(0, i).join('/'));
    }
  });

  return {
    exists: (path: string) => path in files || directories.has(path),
    read: (path: string) => {
      if (!(path in files)) throw new Error(`File not found: ${path}`);
      return files[path];
    },
    join: (...paths: string[]) => paths.join('/'),
    readDir: (dirPath: string) => {
      const normalizedDir = dirPath.endsWith('/') ? dirPath.slice(0, -1) : dirPath;
      const entries = new Set<string>();

      // Add files and directories
      Object.keys(files).forEach(filePath => {
        if (filePath.startsWith(normalizedDir + '/')) {
          const relativePath = filePath.substring(normalizedDir.length + 1);
          const firstPart = relativePath.split('/')[0];
          entries.add(firstPart);
        }
      });

      // Add subdirectories
      directories.forEach(dir => {
        if (dir.startsWith(normalizedDir + '/')) {
          const relativePath = dir.substring(normalizedDir.length + 1);
          const firstPart = relativePath.split('/')[0];
          entries.add(firstPart);
        }
      });

      return Array.from(entries);
    },
    isDirectory: (path: string) => {
      return directories.has(path);
    },
  };
}
