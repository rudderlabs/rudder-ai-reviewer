import { cleanSemverPrefix } from '@core/shared/npm/version-utils';
import type { FileSystem } from '@custom-types/file.type';

export class PackageReader {
  constructor(private readonly fs: FileSystem) {}

  read(repoPath: string, packageName: string): string | null {
    const packagePath = this.fs.join(repoPath, 'package.json');

    if (!this.fs.exists(packagePath)) {
      return null;
    }

    try {
      const content = this.fs.read(packagePath);
      const packageJson = JSON.parse(content);

      const allDeps: Record<string, string> = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      const rawVersion = allDeps[packageName];
      if (!rawVersion) {
        return null;
      }

      return cleanSemverPrefix(rawVersion);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to read package.json: ${errorMessage}`);
      return null;
    }
  }
}
